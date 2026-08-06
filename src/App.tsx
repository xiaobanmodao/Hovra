import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { CameraStage } from "./components/CameraStage";
import { GestureDiagnostics } from "./components/GestureDiagnostics";
import { Playground } from "./components/Playground";
import { StatusPanel } from "./components/StatusPanel";
import { SystemControlPanel } from "./components/SystemControlPanel";
import { StabilityTestPanel } from "./components/StabilityTestPanel";
import { mapMirroredPoint, smoothPoint, type Point } from "./cursor/cursorController";
import { DEFAULT_GESTURE_SETTINGS } from "./gesture/config";
import { GestureEngine } from "./gesture/gestureEngine";
import {
  advanceStabilitySession,
  cancelStabilitySession,
  completeStabilitySession,
  createStabilitySession,
  type StabilitySession,
} from "./gesture/stabilityTest";
import { analyzeStabilitySamples, type StabilityReport } from "./gesture/stabilityTuning";
import { resolveStablePinchThresholds } from "./gesture/stableHandMetrics";
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
  rightClick: false,
  doubleClick: false,
  scrollY: 0,
  dragStart: false,
  dragEnd: false,
  phase: "lost",
  candidate: null,
  lockedGesture: null,
  confirmationProgress: 0,
  diagnostics: {
    timestampMs: 0,
    quality: 0,
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

const IDLE_STABILITY_SESSION: StabilitySession = {
  phase: "idle", startedAt: 0, lastObservedAt: null, stepIndex: 0,
  stepElapsedMs: 0, samples: [], quality: { valid: false, message: "尚未开始" },
};

const clampToViewport = (point: Point): Point => ({
  x: Math.min(window.innerWidth, Math.max(0, point.x)),
  y: Math.min(window.innerHeight, Math.max(0, point.y)),
});

const clampNormalizedPoint = (point: Point): Point => ({
  x: Math.min(1, Math.max(0, point.x)),
  y: Math.min(1, Math.max(0, point.y)),
});

const desktopCursorState = (output: GestureOutput) => {
  if (output.phase === "candidate" && output.candidate === "left") {
    return "candidate-left" as const;
  }
  if (output.phase === "releasing" && output.lockedGesture === "left") {
    return "releasing-left" as const;
  }
  return output.state === "lost" || output.state === "paused" ? "tracking" : output.state;
};

function App() {
  const desktopBridge = window.gestureDesktop;
  const videoRef = useRef<HTMLVideoElement>(null);
  const normalizedCursorRef = useRef<Point | null>(null);
  const systemControlActiveRef = useRef(false);
  const activationPendingRef = useRef(false);
  const pendingPauseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const lastDispatchedOutputRef = useRef<GestureOutput>(INITIAL_OUTPUT);
  const safetyGenerationRef = useRef(0);
  const stabilityActiveRef = useRef(false);
  const settingsBeforeTuningRef = useRef<GestureSettings | null>(null);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_GESTURE_SETTINGS }));
  const engine = useMemo(() => new GestureEngine(settings), [settings]);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("正在请求摄像头权限");
  const [trackerStatus, setTrackerStatus] = useState("等待摄像头");
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [output, setOutput] = useState<GestureOutput>(INITIAL_OUTPUT);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [systemCursor, setSystemCursor] = useState<Point | null>(null);
  const [systemControlEnabled, setSystemControlEnabled] = useState(false);
  const [stabilitySession, setStabilitySession] = useState<StabilitySession>(IDLE_STABILITY_SESSION);
  const [stabilityReport, setStabilityReport] = useState<StabilityReport | null>(null);
  const [stabilityApplied, setStabilityApplied] = useState(false);
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
    setOutput(nextOutput);
  }, []);

  const handleCameraRetry = useCallback(() => {
    setCameraReady(false);
    setCameraStatus("正在请求摄像头权限");
    setTrackerStatus("等待摄像头");
    setLandmarks(null);
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

  const enableSystemControl = useCallback(async () => {
    if (!desktopBridge || stabilityActiveRef.current) {
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

  const startStabilityTest = useCallback(async () => {
    await pauseSystemControl();
    settingsBeforeTuningRef.current = { ...settings };
    stabilityActiveRef.current = true;
    setStabilityApplied(false);
    setStabilityReport(null);
    setStabilitySession(createStabilitySession(performance.now()));
  }, [pauseSystemControl, settings]);

  const cancelStabilityTest = useCallback(() => {
    stabilityActiveRef.current = false;
    setStabilitySession((current) => cancelStabilitySession(current));
  }, []);

  const applyStabilityRecommendation = useCallback(() => {
    if (!stabilityReport?.recommendation.safe) return;
    const { enterRatio, exitRatio } = stabilityReport.recommendation;
    if (enterRatio === null || exitRatio === null) return;
    handleSettingsChange({ ...settings, pinchEnterRatio: enterRatio, pinchExitRatio: exitRatio });
    setStabilityApplied(true);
  }, [handleSettingsChange, settings, stabilityReport]);

  const restorePreTestSettings = useCallback(() => {
    if (!settingsBeforeTuningRef.current) return;
    handleSettingsChange({ ...settingsBeforeTuningRef.current });
    setStabilityApplied(false);
  }, [handleSettingsChange]);

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
    if (lastDispatchedOutputRef.current === output) {
      return;
    }
    lastDispatchedOutputRef.current = output;

    if (!desktopBridge) {
      return;
    }

    if (output.state === "lost") {
      if (systemControlActiveRef.current) {
        void desktopBridge.mouseUp().catch(() => pauseSystemControl());
      }
      return;
    }

    if (!systemControlActiveRef.current) {
      return;
    }

    if (output.state === "paused") {
      if (output.click) {
        void desktopBridge.click().catch(() => pauseSystemControl());
      }
      return;
    }

    if (systemCursor) {
      void desktopBridge.move(systemCursor.x, systemCursor.y, desktopCursorState(output))
        .catch(() => pauseSystemControl());
    }
    if (output.click) {
      void desktopBridge.click().catch(() => pauseSystemControl());
    }
  }, [desktopBridge, output, pauseSystemControl, systemCursor]);

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
          setOutput(nextOutput);
          if (stabilityActiveRef.current) {
            setStabilitySession((current) => {
              const next = advanceStabilitySession(current, {
                nowMs,
                output: nextOutput,
                handPresent: nextLandmarks !== null,
                pageFocused: typeof document.hasFocus !== "function" || document.hasFocus(),
              });
              if (next.phase === "analyzing") stabilityActiveRef.current = false;
              return next;
            });
          }
          if (!failed) {
            setTrackerStatus(detectedHand ? "已检测到手部" : "未检测到手部");
          }

          if (
            nextOutput.cursor
            && nextOutput.state !== "paused"
            && nextOutput.state !== "lost"
          ) {
            const mapped = mapMirroredPoint(nextOutput.cursor, {
              width: 1,
              height: 1,
            });
            const smoothed = normalizedCursorRef.current
              ? smoothPoint(normalizedCursorRef.current, mapped, settings.cursorSmoothingFactor)
              : mapped;
            const calibrated = clampNormalizedPoint({
              x: smoothed.x + settings.cursorOffsetX,
              y: smoothed.y + settings.cursorOffsetY,
            });
            const nextCursor = clampToViewport({
              x: calibrated.x * window.innerWidth,
              y: calibrated.y * window.innerHeight,
            });
            normalizedCursorRef.current = smoothed;
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

  useEffect(() => {
    if (stabilitySession.phase !== "analyzing") return;
    setStabilityReport(analyzeStabilitySamples(
      stabilitySession.samples,
      resolveStablePinchThresholds(settings),
    ));
    setStabilitySession((current) => completeStabilitySession(current));
  }, [settings, stabilitySession]);

  const stabilityRunning = stabilitySession.phase === "readiness"
    || stabilitySession.phase === "positive"
    || stabilitySession.phase === "negative"
    || stabilitySession.phase === "analyzing";

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">本机实时交互</p>
          <h1>手势控制</h1>
        </div>
        <p>单手即可控制移动、左键点击和张手停止。</p>
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
        disabled={stabilityRunning}
      />

      <CalibrationPanel
        settings={settings}
        onSettingsChange={handleSettingsChange}
        pinchRatio={output.diagnostics.leftPinchRatio}
        gestureState={output.state}
        cursor={cursor}
        disabled={stabilityRunning}
      />

      <StabilityTestPanel
        session={stabilitySession}
        report={stabilityReport}
        applied={stabilityApplied}
        canStart={cameraReady && landmarker !== null}
        onStart={() => { void startStabilityTest(); }}
        onCancel={cancelStabilityTest}
        onApply={applyStabilityRecommendation}
        onRestore={restorePreTestSettings}
      />

      <GestureDiagnostics
        output={output}
        onSaveTrace={desktopBridge ? handleSaveTrace : undefined}
      />

      <div className="gesture-workspace">
        <CameraStage
          videoRef={videoRef}
          landmarks={landmarks}
          onCameraReady={handleCameraReady}
          onCameraError={handleCameraError}
          onCameraRetry={handleCameraRetry}
        />
        <Playground cursor={cursor} output={output} />
      </div>

      {cursor && (
        <div
          className={`virtual-cursor is-${output.state}${output.phase === "candidate" ? " is-candidate" : ""}${output.phase === "releasing" ? " is-releasing" : ""}`}
          style={{ left: cursor.x, top: cursor.y, pointerEvents: "none" }}
          aria-hidden="true"
        />
      )}
    </main>
  );
}

export default App;
