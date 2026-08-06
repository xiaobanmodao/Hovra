import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { CameraStage } from "./components/CameraStage";
import { GestureDiagnostics } from "./components/GestureDiagnostics";
import { IntentFeedbackPanel } from "./components/IntentFeedbackPanel";
import { Playground } from "./components/Playground";
import { StatusPanel } from "./components/StatusPanel";
import { SystemControlPanel } from "./components/SystemControlPanel";
import { mapMirroredPoint, type Point } from "./cursor/cursorController";
import { DEFAULT_GESTURE_SETTINGS } from "./gesture/config";
import { GestureEngine } from "./gesture/gestureEngine";
import {
  createIntentFeedbackState,
  labelIntentEvent,
  parseIntentFeedback,
  recordIntentFrame,
  serializeIntentFeedback,
  type IntentLabel,
} from "./gesture/intentFeedback";
import { analyzeIntentFeedback } from "./gesture/intentTuning";
import { resolvePinchClickConfig } from "./gesture/pinchClickStateMachine";
import { gestureStateLabel } from "./i18n/zh-CN";
import {
  type GestureOutput,
  type GestureSettings,
  type Landmark,
} from "./gesture/types";
import { createHandLandmarker, detectFirstHand } from "./vision/handLandmarker";

const INITIAL_OUTPUT: GestureOutput = {
  state: "lost",
  cursor: null,
  click: false,
  clickCursor: null,
  intentEvidence: null,
  rightClick: false,
  doubleClick: false,
  scrollY: 0,
  dragStart: false,
  dragEnd: false,
  phase: "lost",
  candidate: null,
  lockedGesture: null,
  confirmationProgress: 0,
  longPressProgress: 0,
  diagnostics: {
    timestampMs: 0,
    quality: 0,
    trackingSource: "lost",
    trackingQuality: 0,
    rejectedLandmarkCount: 0,
    palmScale: null,
    screenPinchGap: null,
    imageAspectRatio: 1,
    worldPalmScale: null,
    palmFacingScore: null,
    leftPinchRatio: null,
    worldLeftPinchRatio: null,
    pinchDepthReliable: false,
    rightPinchRatio: null,
    doublePinchRatio: null,
    openPalmScore: null,
    scrollPoseScore: null,
    pinchProbability: null,
    pinchImageDepthGap: null,
    pinchWorldQuality: 0,
    pinchQualityReasons: [],
    pinchBlockingReason: null,
    pinchEnterVotes: 0,
    pinchRequiredVotes: 2,
    effectiveFps: null,
    inferenceMs: null,
    pinchModelMode: "mediapipe",
    visionPinchRatio: null,
    visionConfidence: null,
    visionAgeMs: null,
    visionInferenceMs: null,
    modelAgreement: null,
  },
};

const INTENT_FEEDBACK_STORAGE_KEY = "hovra.intent-feedback.v1";

const clampToViewport = (point: Point): Point => ({
  x: Math.min(window.innerWidth, Math.max(0, point.x)),
  y: Math.min(window.innerHeight, Math.max(0, point.y)),
});

const clampNormalizedPoint = (point: Point): Point => ({
  x: Math.min(1, Math.max(0, point.x)),
  y: Math.min(1, Math.max(0, point.y)),
});

const mapSystemPoint = (point: Landmark, settings: GestureSettings): Point => {
  const mirrored = mapMirroredPoint(point, { width: 1, height: 1 });
  return clampNormalizedPoint({
    x: mirrored.x + settings.cursorOffsetX,
    y: mirrored.y + settings.cursorOffsetY,
  });
};

const desktopCursorState = (output: GestureOutput) => {
  if (output.phase === "candidate") {
    return output.candidate === "right"
      ? "candidate-right" as const
      : "candidate-left" as const;
  }
  if (output.phase === "releasing") {
    return output.lockedGesture === "right"
      ? "releasing-right" as const
      : "releasing-left" as const;
  }
  return output.state === "lost" || output.state === "paused" ? "tracking" : output.state;
};

function App() {
  const desktopBridge = window.gestureDesktop;
  const videoRef = useRef<HTMLVideoElement>(null);
  const systemControlActiveRef = useRef(false);
  const activationPendingRef = useRef(false);
  const pendingPauseRef = useRef<Promise<void> | null>(null);
  const desktopCommandQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const lastDispatchedOutputRef = useRef<GestureOutput>(INITIAL_OUTPUT);
  const safetyGenerationRef = useRef(0);
  const settingsBeforeIntentTuningRef = useRef<GestureSettings | null>(null);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_GESTURE_SETTINGS }));
  const engine = useMemo(() => new GestureEngine(settings), [settings]);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("正在请求摄像头权限");
  const [trackerStatus, setTrackerStatus] = useState("等待摄像头");
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [worldLandmarks, setWorldLandmarks] = useState<Landmark[] | null>(null);
  const [output, setOutput] = useState<GestureOutput>(INITIAL_OUTPUT);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [systemCursor, setSystemCursor] = useState<Point | null>(null);
  const [systemControlEnabled, setSystemControlEnabled] = useState(false);
  const [intentFeedback, setIntentFeedback] = useState(() => createIntentFeedbackState(
    {},
    parseIntentFeedback(localStorage.getItem(INTENT_FEEDBACK_STORAGE_KEY)),
  ));
  const [intentSettingsApplied, setIntentSettingsApplied] = useState(false);
  const intentConfig = useMemo(() => resolvePinchClickConfig({
    requiredContactFrames: settings.pinchContactFrames,
    requiredReleaseFrames: settings.pinchReleaseFrames,
    maxCursorSpeed: settings.maxClickSpeed,
    maxTravel: settings.maxClickTravel,
  }), [settings.maxClickSpeed, settings.maxClickTravel, settings.pinchContactFrames, settings.pinchReleaseFrames]);
  const intentReport = useMemo(
    () => analyzeIntentFeedback(intentFeedback.events, intentConfig),
    [intentConfig, intentFeedback.events],
  );
  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setCameraStatus("摄像头已启用");
  }, []);

  const handleCameraError = useCallback((message: string) => {
    const nextOutput = engineRef.current.update(null, performance.now());
    setCameraReady(false);
    setCameraStatus(message);
    setTrackerStatus("不可用");
    setLandmarks(null);
    setWorldLandmarks(null);
    setOutput(nextOutput);
  }, []);

  const handleCameraRetry = useCallback(() => {
    setCameraReady(false);
    setCameraStatus("正在请求摄像头权限");
    setTrackerStatus("等待摄像头");
    setLandmarks(null);
    setWorldLandmarks(null);
    setOutput(engineRef.current.update(null, performance.now()));
  }, []);

  const handleSettingsChange = useCallback((nextSettings: GestureSettings) => {
    setOutput(engineRef.current.update(null, performance.now()));
    setSettings(nextSettings);
  }, []);

  const handleSaveTrace = useCallback((): Promise<"saved" | "cancelled"> => {
    if (!desktopBridge) return Promise.resolve("cancelled");
    return desktopBridge.saveGestureTrace(engineRef.current.serializeTrace());
  }, [desktopBridge]);

  const pauseSystemControl = useCallback((): Promise<void> => {
    systemControlActiveRef.current = false;
    activationPendingRef.current = false;
    safetyGenerationRef.current += 1;

    if (pendingPauseRef.current) {
      return pendingPauseRef.current;
    }

    if (!desktopBridge) {
      if (mountedRef.current) {
        setSystemControlEnabled(false);
      }
      return Promise.resolve();
    }

    const pause = (async () => {
      try {
        await desktopBridge.releaseAndPause();
      } catch {
        // The renderer must still deactivate if the main process is shutting down.
      } finally {
        if (mountedRef.current) {
          setSystemControlEnabled(false);
        }
        pendingPauseRef.current = null;
      }
    })();
    pendingPauseRef.current = pause;
    return pause;
  }, [desktopBridge]);

  const enqueueDesktopCommand = useCallback((command: () => Promise<void>) => {
    const generation = safetyGenerationRef.current;
    const queued = desktopCommandQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (
          !systemControlActiveRef.current
          || generation !== safetyGenerationRef.current
        ) {
          return;
        }
        await command();
      });
    desktopCommandQueueRef.current = queued;
    void queued.catch(() => pauseSystemControl());
  }, [pauseSystemControl]);

  const enableSystemControl = useCallback(async () => {
    if (!desktopBridge) {
      return;
    }

    if (pendingPauseRef.current) {
      await pendingPauseRef.current;
    }

    const safetyGeneration = safetyGenerationRef.current;
    activationPendingRef.current = true;
    try {
      const activated = await desktopBridge.activate();
      activationPendingRef.current = false;
      if (
        activated
        && safetyGeneration === safetyGenerationRef.current
        && mountedRef.current
      ) {
        systemControlActiveRef.current = true;
        setSystemControlEnabled(true);
      } else {
        await pauseSystemControl();
      }
    } catch {
      await pauseSystemControl();
    }
  }, [desktopBridge, pauseSystemControl]);

  const labelRecentIntent = useCallback((id: string, label: Exclude<IntentLabel, "unlabeled">) => {
    setIntentFeedback((current) => labelIntentEvent(current, id, label));
  }, []);

  const applyIntentRecommendation = useCallback(() => {
    const recommendation = intentReport.recommendation;
    if (!recommendation.safe || !recommendation.config) return;
    if (!settingsBeforeIntentTuningRef.current) {
      settingsBeforeIntentTuningRef.current = { ...settings };
    }
    const config = recommendation.config;
    handleSettingsChange({
      ...settings,
      pinchContactFrames: config.requiredContactFrames,
      pinchReleaseFrames: config.requiredReleaseFrames,
      maxClickSpeed: config.maxCursorSpeed,
      maxClickTravel: config.maxTravel,
    });
    setIntentSettingsApplied(true);
  }, [handleSettingsChange, intentReport.recommendation, settings]);

  const restoreIntentSettings = useCallback(() => {
    if (!settingsBeforeIntentTuningRef.current) return;
    handleSettingsChange({ ...settingsBeforeIntentTuningRef.current });
    setIntentSettingsApplied(false);
  }, [handleSettingsChange]);

  const clearIntentFeedback = useCallback(() => {
    setIntentFeedback(createIntentFeedbackState());
    localStorage.removeItem(INTENT_FEEDBACK_STORAGE_KEY);
  }, []);

  useEffect(() => {
    const handleSafetyPause = () => {
      void pauseSystemControl();
    };

    const unsubscribe = desktopBridge?.onSafetyPause(handleSafetyPause);
    return () => {
      unsubscribe?.();
    };
  }, [desktopBridge, pauseSystemControl]);

  useEffect(() => () => {
    mountedRef.current = false;
    void pauseSystemControl();
  }, [pauseSystemControl]);

  useEffect(() => {
    localStorage.setItem(
      INTENT_FEEDBACK_STORAGE_KEY,
      serializeIntentFeedback(intentFeedback.events),
    );
  }, [intentFeedback.events]);

  useEffect(() => {
    if (lastDispatchedOutputRef.current === output) {
      return;
    }
    lastDispatchedOutputRef.current = output;

    if (!desktopBridge) {
      return;
    }

    if (!systemControlActiveRef.current) {
      return;
    }

    if (output.state === "lost" || output.state === "paused" || output.dragEnd) {
      enqueueDesktopCommand(() => desktopBridge.mouseUp());
      return;
    }

    if (output.dragStart) {
      const lockedCursor = output.clickCursor
        ? mapSystemPoint(output.clickCursor, settings)
        : systemCursor;
      enqueueDesktopCommand(async () => {
        if (lockedCursor) {
          await desktopBridge.move(
            lockedCursor.x,
            lockedCursor.y,
            desktopCursorState(output),
            output.longPressProgress,
          );
        }
        await desktopBridge.mouseDown();
      });
      return;
    }

    if (output.state === "dragging" || (
      output.phase === "releasing" && output.lockedGesture === "left"
    )) {
      if (systemCursor) {
        enqueueDesktopCommand(() => desktopBridge.drag(systemCursor.x, systemCursor.y));
      }
      return;
    }

    if (output.click) {
      const lockedCursor = output.clickCursor
        ? mapSystemPoint(output.clickCursor, settings)
        : systemCursor;
      enqueueDesktopCommand(async () => {
        if (lockedCursor) {
          await desktopBridge.move(
            lockedCursor.x,
            lockedCursor.y,
            desktopCursorState(output),
            output.longPressProgress,
          );
        }
        await desktopBridge.click();
      });
      return;
    }
    if (output.rightClick) {
      const lockedCursor = output.clickCursor
        ? mapSystemPoint(output.clickCursor, settings)
        : systemCursor;
      enqueueDesktopCommand(async () => {
        if (lockedCursor) {
          await desktopBridge.move(
            lockedCursor.x,
            lockedCursor.y,
            desktopCursorState(output),
            output.longPressProgress,
          );
        }
        await desktopBridge.rightClick();
      });
      return;
    }
    if (systemCursor) {
      enqueueDesktopCommand(() => desktopBridge.move(
        systemCursor.x,
        systemCursor.y,
        desktopCursorState(output),
        output.longPressProgress,
      ));
    }
  }, [desktopBridge, enqueueDesktopCommand, output, settings, systemCursor]);

  useEffect(() => {
    if (!cameraReady) {
      return;
    }

    let active = true;
    let tracker: HandLandmarker | null = null;
    setTrackerStatus("正在加载模型");

    void createHandLandmarker()
      .then((createdTracker) => {
        if (!active) {
          createdTracker.close();
          return;
        }

        tracker = createdTracker;
        setLandmarker(createdTracker);
        setTrackerStatus("准备就绪，请展示一只手");
      })
      .catch(() => {
        if (active) {
          setTrackerStatus("模型加载失败，请重新加载后重试");
        }
      });

    return () => {
      active = false;
      setLandmarker(null);
      tracker?.close();
    };
  }, [cameraReady]);

  useEffect(() => {
    if (!landmarker) {
      return;
    }

    let animationFrame = 0;
    let active = true;
    let lastVideoTime: number | null = null;
    let lastFreshFrameAt: number | null = null;
    let staleFrameHandled = false;

    const recognize = (nowMs: number) => {
      if (!active) {
        return;
      }

      const video = videoRef.current;
      if (video) {
        if (
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          && video.currentTime !== lastVideoTime
        ) {
          lastVideoTime = video.currentTime;
          lastFreshFrameAt = nowMs;
          staleFrameHandled = false;

          let failed = false;
          const inferenceStartedAt = performance.now();
          const detectedHand = detectFirstHand(landmarker, video, nowMs, () => {
            failed = true;
            setTrackerStatus("识别出错，请重新加载后重试");
          });
          const inferenceMs = Math.max(0, performance.now() - inferenceStartedAt);
          const nextLandmarks = detectedHand?.landmarks ?? null;
          const nextWorldLandmarks = detectedHand?.worldLandmarks ?? null;
          const imageAspectRatio = video.videoHeight > 0
            ? video.videoWidth / video.videoHeight
            : 1;
          const nextOutput = engine.update(
            nextLandmarks,
            nowMs,
            nextWorldLandmarks,
            inferenceMs,
            imageAspectRatio,
          );

          setLandmarks(nextLandmarks);
          setWorldLandmarks(nextWorldLandmarks);
          setOutput(nextOutput);
          setIntentFeedback((current) => recordIntentFrame(current, {
            t: nowMs,
            evidence: nextOutput.intentEvidence ?? null,
            clicked: nextOutput.click && systemControlActiveRef.current,
            pinchRatio: nextOutput.diagnostics.pinchSpatialRatio ?? null,
          }, nextOutput.click && systemControlActiveRef.current
            ? nextOutput.clickCursor ?? nextOutput.cursor
            : null));
          if (!failed) {
            setTrackerStatus(detectedHand ? "已检测到手部" : "未检测到手部");
          }

          if (
            nextOutput.cursor
            && nextOutput.state !== "paused"
            && nextOutput.state !== "lost"
          ) {
            const calibrated = mapSystemPoint(nextOutput.cursor, settings);
            const nextCursor = clampToViewport({
              x: calibrated.x * window.innerWidth,
              y: calibrated.y * window.innerHeight,
            });
            setSystemCursor(calibrated);
            setCursor(nextCursor);
          }
        }

        if (
          lastFreshFrameAt !== null
          && nowMs - lastFreshFrameAt >= settings.cameraStaleFrameMs
          && !staleFrameHandled
        ) {
          staleFrameHandled = true;
          setLandmarks(null);
          setWorldLandmarks(null);
          setOutput(engine.update(null, nowMs));
          setTrackerStatus("摄像头画面停滞");
        }
      }

      animationFrame = requestAnimationFrame(recognize);
    };

    animationFrame = requestAnimationFrame(recognize);

    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
    };
  }, [engine, landmarker, settings.cameraStaleFrameMs, settings.cursorOffsetX, settings.cursorOffsetY, settings.cursorSmoothingFactor]);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">本机实时交互</p>
          <h1>Hovra</h1>
        </div>
        <p>单手即可控制移动、左键、右键、长按和张手停止。</p>
      </header>

      <StatusPanel
        camera={cameraStatus}
        tracker={trackerStatus}
        gesture={gestureStateLabel(output.state)}
      />

      <SystemControlPanel
        enabled={systemControlEnabled}
        onEnable={enableSystemControl}
        onPause={pauseSystemControl}
      />

      <CalibrationPanel
        settings={settings}
        onSettingsChange={handleSettingsChange}
        pinchRatio={output.diagnostics.leftPinchRatio}
        gestureState={output.state}
        cursor={cursor}
      />

      <IntentFeedbackPanel
        events={intentFeedback.events}
        report={intentReport}
        applied={intentSettingsApplied}
        onLabel={labelRecentIntent}
        onApply={applyIntentRecommendation}
        onRestore={restoreIntentSettings}
        onClear={clearIntentFeedback}
      />

      <GestureDiagnostics
        output={output}
        onSaveTrace={desktopBridge ? handleSaveTrace : undefined}
      />

      <div className="gesture-workspace">
        <CameraStage
          videoRef={videoRef}
          landmarks={landmarks}
          worldLandmarks={worldLandmarks}
          overlayState={{
            phase: output.phase,
            blockingReason: output.diagnostics.clickBlockingReason
              ?? output.diagnostics.pinchBlockingReason,
            state: output.state,
          }}
          onCameraReady={handleCameraReady}
          onCameraError={handleCameraError}
          onCameraRetry={handleCameraRetry}
        />
        <Playground cursor={cursor} output={output} />
      </div>

      {cursor && (
        <div
          className={`virtual-cursor is-${output.state}${output.phase === "candidate" ? " is-candidate" : ""}${output.phase === "releasing" ? " is-releasing" : ""}`}
          style={{
            left: cursor.x,
            top: cursor.y,
            pointerEvents: "none",
            "--long-press-progress": output.longPressProgress,
          } as CSSProperties}
          aria-hidden="true"
        />
      )}
    </main>
  );
}

export default App;
