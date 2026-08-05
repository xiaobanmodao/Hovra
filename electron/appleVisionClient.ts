import { Buffer } from "node:buffer";

import type { AppleVisionObservation } from "../src/vision/appleVisionTypes";
import { parseAppleVisionResponse } from "./appleVisionProtocol";

export type AppleVisionProcess = {
  stdin: { write(value: string): boolean };
  stdout: { on(event: "data", listener: (chunk: Uint8Array | string) => void): unknown };
  on(event: "exit" | "error", listener: (...args: unknown[]) => void): unknown;
  kill(): unknown;
};

type PendingRequest = {
  id: number;
  capturedAtMs: number;
  resolve(value: AppleVisionObservation | null): void;
  timer: ReturnType<typeof setTimeout>;
};

type AppleVisionClientOptions = {
  spawn(): AppleVisionProcess;
  now?: () => number;
  timeoutMs?: number;
  restartCooldownMs?: number;
};

const MAX_JPEG_BYTES = 400 * 1024;

export class AppleVisionClient {
  private readonly spawnProcess: () => AppleVisionProcess;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly restartCooldownMs: number;
  private process: AppleVisionProcess | null = null;
  private pending: PendingRequest | null = null;
  private stdoutBuffer = "";
  private nextRequestId = 1;
  private restartAllowedAt = 0;
  private disposed = false;

  constructor(options: AppleVisionClientOptions) {
    this.spawnProcess = options.spawn;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 250;
    this.restartCooldownMs = options.restartCooldownMs ?? 5_000;
  }

  async detect(jpeg: Uint8Array, capturedAtMs: number): Promise<AppleVisionObservation | null> {
    validateRequest(jpeg, capturedAtMs);
    if (this.disposed || this.pending || !this.ensureProcess()) {
      return Promise.resolve(null);
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending?.id === id) {
          this.pending = null;
          resolve(null);
        }
      }, this.timeoutMs);
      this.pending = { id, capturedAtMs, resolve, timer };

      try {
        this.process!.stdin.write(`${JSON.stringify({
          id,
          imageBase64: Buffer.from(jpeg).toString("base64"),
        })}\n`);
      } catch {
        this.finishPending(null);
        this.handleProcessFailure();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.finishPending(null);
    this.process?.kill();
    this.process = null;
    this.stdoutBuffer = "";
  }

  private ensureProcess(): boolean {
    if (this.process) return true;
    if (this.now() < this.restartAllowedAt) return false;

    try {
      const child = this.spawnProcess();
      child.stdout.on("data", (chunk) => this.handleStdout(chunk));
      child.on("exit", () => this.handleProcessFailure());
      child.on("error", () => this.handleProcessFailure());
      this.process = child;
      this.stdoutBuffer = "";
      return true;
    } catch {
      this.restartAllowedAt = this.now() + this.restartCooldownMs;
      return false;
    }
  }

  private handleStdout(chunk: Uint8Array | string): void {
    this.stdoutBuffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.handleLine(line);
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let response;
    try {
      response = parseAppleVisionResponse(line);
    } catch {
      this.finishPending(null);
      return;
    }
    if (!this.pending || response.id !== this.pending.id) return;
    if (!response.landmarks || response.error !== null) {
      this.finishPending(null);
      return;
    }

    this.finishPending({
      landmarks: response.landmarks.map(({ x, y }) => ({ x, y })),
      confidences: response.landmarks.map(({ confidence }) => confidence),
      capturedAtMs: this.pending.capturedAtMs,
      inferenceMs: response.inferenceMs,
    });
  }

  private finishPending(value: AppleVisionObservation | null): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(value);
  }

  private handleProcessFailure(): void {
    if (!this.process) return;
    this.finishPending(null);
    this.process = null;
    this.stdoutBuffer = "";
    this.restartAllowedAt = this.now() + this.restartCooldownMs;
  }
}

function validateRequest(jpeg: Uint8Array, capturedAtMs: number): void {
  if (!(jpeg instanceof Uint8Array) || jpeg.byteLength === 0) {
    throw new TypeError("Apple Vision requires non-empty JPEG data");
  }
  if (jpeg.byteLength > MAX_JPEG_BYTES) {
    throw new TypeError("Apple Vision JPEG must not exceed 400 KiB");
  }
  if (!Number.isFinite(capturedAtMs) || capturedAtMs < 0) {
    throw new TypeError("Apple Vision capture timestamp must be finite and non-negative");
  }
}
