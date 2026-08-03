import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { CameraStage } from "./components/CameraStage";
import { Playground } from "./components/Playground";
import { StatusPanel } from "./components/StatusPanel";
import { mapMirroredPoint, smoothPoint, type Point } from "./cursor/cursorController";
import { DEFAULT_GESTURE_SETTINGS } from "./gesture/config";
import { GestureEngine } from "./gesture/gestureEngine";
import {
  INDEX_FINGER_TIP,
  THUMB_TIP,
  type GestureOutput,
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

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cursorRef = useRef<Point | null>(null);
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
  const pinchDistance = useMemo(() => {
    const thumb = landmarks?.[THUMB_TIP];
    const index = landmarks?.[INDEX_FINGER_TIP];
    return thumb && index ? Math.hypot(thumb.x - index.x, thumb.y - index.y) : null;
  }, [landmarks]);

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
              width: window.innerWidth,
              height: window.innerHeight,
            });
            const smoothed = cursorRef.current
              ? smoothPoint(cursorRef.current, mapped, settings.cursorSmoothingFactor)
              : mapped;
            const nextCursor = clampToViewport(smoothed);
            cursorRef.current = nextCursor;
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
  }, [engine, landmarker, settings.cameraStaleFrameMs, settings.cursorSmoothingFactor]);

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

      <CalibrationPanel
        settings={settings}
        onSettingsChange={setSettings}
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
