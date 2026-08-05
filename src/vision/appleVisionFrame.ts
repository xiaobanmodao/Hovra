import type { AppleVisionObservation } from "./appleVisionTypes";

const MAX_EDGE = 512;
const MAX_JPEG_BYTES = 400 * 1024;

export async function captureAppleVisionFrame(
  video: HTMLVideoElement,
  documentLike: Pick<Document, "createElement"> = document,
): Promise<Uint8Array> {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new TypeError("Apple Vision video dimensions are unavailable");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = documentLike.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new TypeError("Apple Vision canvas is unavailable");
  }
  context.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.72);
  });
  if (!blob) {
    throw new TypeError("Apple Vision JPEG encoding failed");
  }
  if (blob.size === 0 || blob.size > MAX_JPEG_BYTES) {
    throw new TypeError("Apple Vision JPEG must be non-empty and not exceed 400 KiB");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export class AppleVisionScheduler {
  private inFlight = false;
  private lastStartedAt = Number.NEGATIVE_INFINITY;
  private lastAcceptedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly onObservation: (observation: AppleVisionObservation) => void,
    private readonly minimumIntervalMs = 80,
  ) {}

  schedule(
    capturedAtMs: number,
    request: () => Promise<AppleVisionObservation | null>,
  ): boolean {
    if (
      !Number.isFinite(capturedAtMs)
      || capturedAtMs < 0
      || this.inFlight
      || capturedAtMs - this.lastStartedAt < this.minimumIntervalMs
    ) {
      return false;
    }

    this.inFlight = true;
    this.lastStartedAt = capturedAtMs;
    void request()
      .then((observation) => {
        if (
          observation
          && observation.capturedAtMs === capturedAtMs
          && observation.capturedAtMs >= this.lastAcceptedAt
        ) {
          this.lastAcceptedAt = observation.capturedAtMs;
          this.onObservation(observation);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = false;
      });
    return true;
  }
}
