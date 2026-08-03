import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { CameraStage } from "./components/CameraStage";
import { Playground } from "./components/Playground";
import { StatusPanel } from "./components/StatusPanel";
import { mapMirroredPoint, smoothPoint, type Point } from "./cursor/cursorController";
import { CAMERA_STALE_FRAME_MS, CURSOR_SMOOTHING_FACTOR } from "./gesture/config";
import { GestureEngine } from "./gesture/gestureEngine";
import type { GestureOutput, Landmark } from "./gesture/types";
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
  const [engine] = useState(() => new GestureEngine());
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Requesting access");
  const [trackerStatus, setTrackerStatus] = useState("Waiting for camera");
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [output, setOutput] = useState<GestureOutput>(INITIAL_OUTPUT);
  const [cursor, setCursor] = useState<Point | null>(null);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setCameraStatus("Active");
  }, []);

  const handleCameraError = useCallback((message: string) => {
    const nextOutput = engine.update(null, performance.now());
    setCameraReady(false);
    setCameraStatus(message);
    setTrackerStatus("Unavailable");
    setLandmarks(null);
    setOutput(nextOutput);
  }, [engine]);

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
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (video.currentTime !== lastVideoTime) {
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
              ? smoothPoint(cursorRef.current, mapped, CURSOR_SMOOTHING_FACTOR)
              : mapped;
            const nextCursor = clampToViewport(smoothed);
            cursorRef.current = nextCursor;
            setCursor(nextCursor);
          }
        } else if (
          lastFreshFrameAt !== null
          && nowMs - lastFreshFrameAt >= CAMERA_STALE_FRAME_MS
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
  }, [engine, landmarker]);

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

      <div className="gesture-workspace">
        <CameraStage
          videoRef={videoRef}
          landmarks={landmarks}
          onCameraReady={handleCameraReady}
          onCameraError={handleCameraError}
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
