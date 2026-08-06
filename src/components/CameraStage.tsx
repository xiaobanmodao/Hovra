import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  buildHandOverlayModel,
  type HandOverlayModel,
  type HandOverlayState,
} from "../gesture/handOverlayModel";
import type { Landmark } from "../gesture/types";

type CameraStageProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  landmarks: Landmark[] | null;
  worldLandmarks?: Landmark[] | null;
  overlayState?: HandOverlayState;
  onCameraReady: () => void;
  onCameraError: (message: string) => void;
  onCameraRetry: () => void;
};

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
  worldLandmarks = null,
  overlayState = { phase: "neutral", blockingReason: null },
  onCameraReady,
  onCameraError,
  onCameraRetry,
}: CameraStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasDrawnLandmarksRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const overlayModel = useMemo(
    () => buildHandOverlayModel(landmarks, worldLandmarks, overlayState),
    [landmarks, overlayState, worldLandmarks],
  );

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
            frameRate: { ideal: 60 },
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

  const drawOverlay = useCallback((model: HandOverlayModel | null) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }

    if (!model && !hasDrawnLandmarksRef.current) {
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
    if (!model) {
      hasDrawnLandmarksRef.current = false;
      return;
    }

    hasDrawnLandmarksRef.current = true;

    drawHandOverlay(context, model, width, height);
  }, [videoRef]);

  useEffect(() => {
    drawOverlay(overlayModel);
  }, [drawOverlay, overlayModel]);

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
        {overlayModel && (
          <span className={`hand-overlay-status is-${overlayModel.pinchBridge?.state ?? "tracking"}`}>
            {overlayModel.statusLabel}
          </span>
        )}
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

function drawHandOverlay(
  context: CanvasRenderingContext2D,
  model: HandOverlayModel,
  width: number,
  height: number,
): void {
  const scale = Math.min(width, height);
  if (typeof context.save === "function") context.save();
  context.lineCap = "round";

  const palmPoints = model.palm.indices.map((index) => model.points[index]!);
  context.beginPath();
  context.moveTo(palmPoints[0]!.x * width, palmPoints[0]!.y * height);
  for (const point of palmPoints.slice(1)) context.lineTo(point.x * width, point.y * height);
  if (typeof context.closePath === "function") context.closePath();
  context.fillStyle = "rgba(28, 142, 177, 0.24)";
  context.fill();
  context.lineWidth = Math.max(1.5, model.palmScale * scale * 0.035);
  context.strokeStyle = "rgba(142, 235, 255, 0.58)";
  context.stroke();

  for (const bone of model.bones) {
    const from = model.points[bone.from]!;
    const to = model.points[bone.to]!;
    context.beginPath();
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.lineWidth = Math.max(3, bone.width * scale * 1.85);
    context.strokeStyle = `rgba(3, 18, 31, ${Math.min(0.72, bone.opacity)})`;
    context.stroke();
    context.beginPath();
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.lineWidth = Math.max(2, bone.width * scale);
    context.strokeStyle = `rgba(91, 214, 255, ${bone.opacity})`;
    context.stroke();
  }

  for (const joint of model.joints) {
    const point = joint.point;
    context.beginPath();
    context.arc(
      point.x * width,
      point.y * height,
      Math.max(2.5, joint.radius * scale),
      0,
      Math.PI * 2,
    );
    context.fillStyle = joint.role === "thumb-tip"
      ? "#ffd36a"
      : joint.role === "index-tip" ? "#72ffb2" : "rgba(238, 250, 255, 0.92)";
    context.fill();
  }

  if (model.pinchBridge) {
    const from = model.points[model.pinchBridge.from]!;
    const to = model.points[model.pinchBridge.to]!;
    context.beginPath();
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.lineWidth = Math.max(4, model.palmScale * scale * 0.08);
    context.strokeStyle = model.pinchBridge.state === "blocked"
      ? "rgba(255, 104, 128, 0.88)"
      : model.pinchBridge.state === "active" ? "rgba(102, 255, 154, 0.92)" : "rgba(255, 211, 106, 0.9)";
    context.stroke();
  }
  if (typeof context.restore === "function") context.restore();
}
