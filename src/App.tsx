import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { CameraStage } from "./components/CameraStage";
import { GestureDiagnostics } from "./components/GestureDiagnostics";
import { Playground } from "./components/Playground";
import { StatusPanel } from "./components/StatusPanel";
import { SystemControlPanel } from "./components/SystemControlPanel";
import { mapMirroredPoint, smoothPoint, type Point } from "./cursor/cursorController";
import { DEFAULT_GESTURE_SETTINGS } from "./gesture/config";
import { GestureEngine } from "./gesture/gestureEngine";
import { gestureStateLabel } from "./i18n/zh-CN";
import { thumbIndexDistance } from "./gesture/landmarkMetrics";
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
    leftPinchRatio: null,
    rightPinchRatio: null,
    doublePinchRatio: null,
    openPalmScore: null,
    scrollPoseScore: null,
  },
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
  if (output.phase === "candidate" && output.candidate && output.candidate !== "open-palm") {
    return `candidate-${output.candidate}` as const;
  }
  if (output.phase === "releasing" && output.lockedGesture && output.lockedGesture !== "open-palm") {
    return `releasing-${output.lockedGesture}` as const;
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
  const pinchDistance = useMemo(() => thumbIndexDistance(landmarks), [landmarks]);

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
      if (output.rightClick) {
        void desktopBridge.rightClick().catch(() => pauseSystemControl());
      }
      if (output.doubleClick) {
        void desktopBridge.doubleClick().catch(() => pauseSystemControl());
      }
      if (output.dragEnd) {
        void desktopBridge.mouseUp().catch(() => pauseSystemControl());
      }
      return;
    }

    if (output.dragStart) {
      void desktopBridge.mouseDown().catch(() => pauseSystemControl());
    }
    if (systemCursor) {
      const movement = output.state === "dragging" || output.dragEnd
        ? desktopBridge.drag(systemCursor.x, systemCursor.y)
        : desktopBridge.move(systemCursor.x, systemCursor.y, desktopCursorState(output));
      void movement.catch(() => pauseSystemControl());
    }
    if (output.click) {
      void desktopBridge.click().catch(() => pauseSystemControl());
    }
    if (output.rightClick) {
      void desktopBridge.rightClick().catch(() => pauseSystemControl());
    }
    if (output.doubleClick) {
      void desktopBridge.doubleClick().catch(() => pauseSystemControl());
    }
    if (output.scrollY !== 0) {
      void desktopBridge.scroll(output.scrollY).catch(() => pauseSystemControl());
    }
    if (output.dragEnd) {
      void desktopBridge.mouseUp().catch(() => pauseSystemControl());
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
          const nextLandmarks = detectFirstHand(landmarker, video, nowMs, () => {
            failed = true;
            setTrackerStatus("识别出错，请重新加载后重试");
          });
          const nextOutput = engine.update(nextLandmarks, nowMs);

          setLandmarks(nextLandmarks);
          setOutput(nextOutput);
          if (!failed) {
            setTrackerStatus(nextLandmarks ? "已检测到手部" : "未检测到手部");
          }

          if (
            nextOutput.cursor
            && nextOutput.state !== "paused"
            && nextOutput.state !== "lost"
            && nextOutput.state !== "scrolling"
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

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">本机实时交互</p>
          <h1>手势控制</h1>
        </div>
        <p>单手即可控制移动、点击、拖动、右键、双击和滚动。</p>
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
        pinchDistance={pinchDistance}
        gestureState={output.state}
        cursor={cursor}
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
