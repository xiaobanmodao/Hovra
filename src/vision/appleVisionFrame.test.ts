import { describe, expect, it, vi } from "vitest";

import {
  AppleVisionScheduler,
  captureAppleVisionFrame,
} from "./appleVisionFrame";
import type { AppleVisionObservation } from "./appleVisionTypes";

const observation = (capturedAtMs: number): AppleVisionObservation => ({
  landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 })),
  confidences: Array(21).fill(0.9),
  capturedAtMs,
  inferenceMs: 10,
});

describe("captureAppleVisionFrame", () => {
  it("encodes an aspect-preserving JPEG whose longest edge is 512 pixels", async () => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/jpeg",
    })));
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob,
    } as unknown as HTMLCanvasElement;
    const documentLike = { createElement: vi.fn(() => canvas) } as unknown as Document;
    const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;

    await expect(captureAppleVisionFrame(video, documentLike)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(288);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 512, 288);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.72);
  });

  it("rejects missing video dimensions, canvas context, JPEG blobs, and oversized output", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
      toBlob: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const documentLike = { createElement: vi.fn(() => canvas) } as unknown as Document;

    await expect(captureAppleVisionFrame({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement, documentLike))
      .rejects.toThrow("dimensions");
    await expect(captureAppleVisionFrame({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement, documentLike))
      .rejects.toThrow("canvas");

    canvas.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
    canvas.toBlob = vi.fn((callback: BlobCallback) => callback(null));
    await expect(captureAppleVisionFrame({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement, documentLike))
      .rejects.toThrow("JPEG");

    canvas.toBlob = vi.fn((callback: BlobCallback) => callback(new Blob([new Uint8Array(400 * 1024 + 1)])));
    await expect(captureAppleVisionFrame({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement, documentLike))
      .rejects.toThrow("400 KiB");
  });
});

describe("AppleVisionScheduler", () => {
  it("allows one request at a time and enforces the 80 ms interval", async () => {
    let resolveRequest!: (value: AppleVisionObservation | null) => void;
    const request = vi.fn(() => new Promise<AppleVisionObservation | null>((resolve) => {
      resolveRequest = resolve;
    }));
    const accepted: AppleVisionObservation[] = [];
    const scheduler = new AppleVisionScheduler((value) => accepted.push(value));

    expect(scheduler.schedule(0, request)).toBe(true);
    expect(scheduler.schedule(79, request)).toBe(false);
    resolveRequest(observation(0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(accepted).toHaveLength(1);
    expect(scheduler.schedule(79, request)).toBe(false);
    expect(scheduler.schedule(80, request)).toBe(true);
  });

  it("ignores null, mismatched, and older observations", async () => {
    const accepted: AppleVisionObservation[] = [];
    const scheduler = new AppleVisionScheduler((value) => accepted.push(value));

    scheduler.schedule(100, async () => observation(99));
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.schedule(180, async () => observation(180));
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.schedule(260, async () => observation(100));
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.schedule(340, async () => null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(accepted.map((value) => value.capturedAtMs)).toEqual([180]);
  });
});
