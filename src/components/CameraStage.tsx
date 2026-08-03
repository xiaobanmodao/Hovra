import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Landmark } from "../gesture/types";

type CameraStageProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  landmarks: Landmark[] | null;
  onCameraReady: () => void;
  onCameraError: (message: string) => void;
  onCameraRetry: () => void;
};

const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const cameraErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Camera permission was denied. Allow camera access, then retry.";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No camera was found on this device.";
  }

  return "The camera could not start. Check browser permissions and camera availability.";
};

export function CameraStage({
  videoRef,
  landmarks,
  onCameraReady,
  onCameraError,
  onCameraRetry,
}: CameraStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasDrawnLandmarksRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    let tracks: MediaStreamTrack[] = [];

    const handleStreamEnded = () => {
      if (!active) {
        return;
      }

      active = false;
      tracks.forEach((track) => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      const message = "Camera stream ended. Reconnect the camera, then retry.";
      setCameraError(message);
      onCameraError(message);
    };

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        const message = "This browser does not support camera access.";
        setCameraError(message);
        onCameraError(message);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        tracks = stream.getTracks();
        tracks.forEach((track) => track.addEventListener("ended", handleStreamEnded));
        stream.addEventListener("inactive", handleStreamEnded);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        if (active) {
          const message = cameraErrorMessage(error);
          setCameraError(message);
          onCameraError(message);
        }
      }
    };

    void startCamera();

    return () => {
      const shouldStopTracks = active;
      active = false;
      tracks.forEach((track) => track.removeEventListener("ended", handleStreamEnded));
      stream?.removeEventListener("inactive", handleStreamEnded);
      if (shouldStopTracks) {
        tracks.forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [onCameraError, retryAttempt, videoRef]);

  const retryCamera = () => {
    setCameraError(null);
    onCameraRetry();
    setRetryAttempt((attempt) => attempt + 1);
  };

  const drawOverlay = useCallback((points: Landmark[] | null) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }

    if (!points && !hasDrawnLandmarksRef.current) {
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, width, height);
    if (!points) {
      hasDrawnLandmarksRef.current = false;
      return;
    }

    hasDrawnLandmarksRef.current = true;

    context.lineCap = "round";
    context.lineWidth = 3;
    context.strokeStyle = "rgba(91, 214, 255, 0.82)";
    for (const [fromIndex, toIndex] of HAND_CONNECTIONS) {
      const from = points[fromIndex];
      const to = points[toIndex];
      if (!from || !to) {
        continue;
      }

      context.beginPath();
      context.moveTo(from.x * width, from.y * height);
      context.lineTo(to.x * width, to.y * height);
      context.stroke();
    }

    context.fillStyle = "#ffffff";
    for (const point of points) {
      context.beginPath();
      context.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2);
      context.fill();
    }
  }, [videoRef]);

  useEffect(() => {
    drawOverlay(landmarks);
  }, [drawOverlay, landmarks]);

  return (
    <section className="camera-panel" aria-labelledby="camera-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Live camera</p>
          <h2 id="camera-title">Hand tracking</h2>
        </div>
        <span className="privacy-badge">Browser only</span>
      </div>
      <div className="camera-media">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedData={onCameraReady}
          aria-label="Mirrored camera preview"
        />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="camera-reticle" aria-hidden="true" />
        {cameraError && (
          <div className="camera-error" role="alert">
            <p>{cameraError}</p>
            <button type="button" onClick={retryCamera}>Retry camera</button>
          </div>
        )}
      </div>
    </section>
  );
}
