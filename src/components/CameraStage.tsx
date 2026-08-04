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
    return "摄像头权限被拒绝。请允许摄像头访问后重试。";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "此设备未发现可用摄像头。";
  }

  return "摄像头无法启动。请检查浏览器权限与设备可用性。";
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
      const message = "摄像头流已结束。请重新连接摄像头后重试。";
      setCameraError(message);
      onCameraError(message);
    };

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        const message = "此浏览器不支持摄像头访问。";
        setCameraError(message);
        onCameraError(message);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
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
          <p className="eyebrow">实时摄像头</p>
          <h2 id="camera-title">手部追踪</h2>
        </div>
        <span className="privacy-badge">仅本机处理</span>
      </div>
      <div className="camera-media">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedData={onCameraReady}
          aria-label="镜像摄像头预览"
        />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="camera-reticle" aria-hidden="true" />
        {cameraError && (
          <div className="camera-error" role="alert">
            <p>{cameraError}</p>
            <button type="button" onClick={retryCamera}>重试摄像头</button>
          </div>
        )}
      </div>
    </section>
  );
}
