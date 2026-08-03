import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { CameraStage } from "./components/CameraStage";
import { Playground } from "./components/Playground";
import { StatusPanel } from "./components/StatusPanel";
import { SystemControlPanel } from "./components/SystemControlPanel";
import { mapMirroredPoint, smoothPoint, type Point } from "./cursor/cursorController";
import { DEFAULT_GESTURE_SETTINGS } from "./gesture/config";
import { GestureEngine } from "./gesture/gestureEngine";
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
  dragStart: false,
  dragEnd: false,
};

const clampToViewport = (point: Point): Point => ({
  x: Math.min(window.innerWidth, Math.max(0, point.x)),
  y: Math.min(window.innerHeight, Math.max(0, point.y)),
});

const clampNormalizedPoint = (point: Point): Point => ({
  x: Math.min(1, Math.max(0, point.x)),
  y: Math.min(1, Math.max(0, point.y)),
});

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
  const [cameraStatus, setCameraStatus] = useState("Requesting access");
  const [trackerStatus, setTrackerStatus] = useState("Waiting for camera");
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [output, setOutput] = useState<GestureOutput>(INITIAL_OUTPUT);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [systemCursor, setSystemCursor] = useState<Point | null>(null);
  const [systemControlEnabled, setSystemControlEnabled] = useState(false);
  const pinchDistance = useMemo(() => thumbIndexDistance(landmarks), [landmarks]);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setCameraStatus("Active");
  }, []);

  const handleCameraError = useCallback((message: string) => {
    const nextOutput = engineRef.current.update(null, performance.now());
    setCameraReady(false);
    setCameraStatus(message);
    setTrackerStatus("Unavailable");
    setLandmarks(null);
    setOutput(nextOutput);
  }, []);

  const handleCameraRetry = useCallback(() => {
    setCameraReady(false);
    setCameraStatus("Requesting access");
    setTrackerStatus("Waiting for camera");
    setLandmarks(null);
    setOutput(engineRef.current.update(null, performance.now()));
  }, []);

  const handleSettingsChange = useCallback((nextSettings: GestureSettings) => {
    setOutput(engineRef.current.update(null, performance.now()));
    setSettings(nextSettings);
  }, []);

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

    if (output.state === "lost" || output.state === "paused") {
      if (systemControlActiveRef.current || activationPendingRef.current) {
        void pauseSystemControl();
      }
      return;
    }

    if (!systemControlActiveRef.current) {
      return;
    }

    if (output.dragStart) {
      void desktopBridge.mouseDown().catch(() => pauseSystemControl());
    }
    if (systemCursor) {
      const movement = output.state === "dragging" || output.dragEnd
        ? desktopBridge.drag(systemCursor.x, systemCursor.y)
        : desktopBridge.move(systemCursor.x, systemCursor.y);
      void movement.catch(() => pauseSystemControl());
    }
    if (output.click) {
      void desktopBridge.click().catch(() => pauseSystemControl());
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
    setTrackerStatus("Loading model");

    void createHandLandmarker()
      .then((createdTracker) => {
        if (!active) {
          createdTracker.close();
          return;
        }

        tracker = createdTracker;
        setLandmarker(createdTracker);
        setTrackerStatus("Ready — show one hand");
      })
      .catch(() => {
        if (active) {
          setTrackerStatus("Model failed to load — reload to retry");
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
            setTrackerStatus("Recognition error — reload to retry");
          });
          const nextOutput = engine.update(nextLandmarks, nowMs);

          setLandmarks(nextLandmarks);
          setOutput(nextOutput);
          if (!failed) {
            setTrackerStatus(nextLandmarks ? "Hand detected" : "No hand detected");
          }

          if (nextOutput.cursor && nextOutput.state !== "paused" && nextOutput.state !== "lost") {
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
          setTrackerStatus("Camera frame stalled");
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
          <p className="eyebrow">Browser-only interaction</p>
          <h1>Hand Gesture Control</h1>
        </div>
        <p>Move, click and drag with one hand. Recognition stays in this browser.</p>
      </header>

      <StatusPanel
        camera={cameraStatus}
        tracker={trackerStatus}
        gesture={output.state}
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
          className={`virtual-cursor is-${output.state}`}
          style={{ left: cursor.x, top: cursor.y, pointerEvents: "none" }}
          aria-hidden="true"
        />
      )}
    </main>
  );
}

export default App;
