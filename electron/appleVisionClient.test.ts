import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { AppleVisionClient, type AppleVisionProcess } from "./appleVisionClient";

function processHarness() {
  const events = new EventEmitter();
  const stdout = new EventEmitter();
  const writes: string[] = [];
  const process: AppleVisionProcess = {
    stdin: { write: (value) => { writes.push(value); return true; } },
    stdout: { on: (event, listener) => { stdout.on(event, listener); return process.stdout; } },
    on: (event, listener) => { events.on(event, listener); return process; },
    kill: vi.fn(),
  };
  return {
    process,
    writes,
    emitLine: (value: unknown) => stdout.emit("data", `${JSON.stringify(value)}\n`),
    emitExit: () => events.emit("exit", 1),
  };
}

const helperLandmarks = () => Array.from({ length: 21 }, (_, index) => ({
  x: index / 21,
  y: 1 - index / 21,
  confidence: index === 4 || index === 8 ? 0.91 : 0.8,
}));

describe("AppleVisionClient", () => {
  it("correlates a strict helper response with its capture timestamp", async () => {
    const harness = processHarness();
    const client = new AppleVisionClient({ spawn: () => harness.process });

    const resultPromise = client.detect(new Uint8Array([1, 2, 3]), 120);
    const request = JSON.parse(harness.writes[0]!.trim()) as { id: number; imageBase64: string };
    expect(request).toEqual({ id: 1, imageBase64: "AQID" });
    harness.emitLine({ id: 99, landmarks: helperLandmarks(), inferenceMs: 10, error: null });
    harness.emitLine({ id: 1, landmarks: helperLandmarks(), inferenceMs: 10, error: null });

    const result = await resultPromise;
    expect(result).toMatchObject({
      capturedAtMs: 120,
      inferenceMs: 10,
    });
    expect(result?.landmarks).toHaveLength(21);
    expect(result?.confidences).toHaveLength(21);
  });

  it("allows only one in-flight request and drops a timed-out late response", async () => {
    vi.useFakeTimers();
    const harness = processHarness();
    const client = new AppleVisionClient({ spawn: () => harness.process, timeoutMs: 250 });

    const first = client.detect(new Uint8Array([1]), 0);
    await expect(client.detect(new Uint8Array([2]), 1)).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    await expect(first).resolves.toBeNull();
    harness.emitLine({ id: 1, landmarks: helperLandmarks(), inferenceMs: 300, error: null });

    const second = client.detect(new Uint8Array([3]), 300);
    expect(harness.writes).toHaveLength(2);
    harness.emitLine({ id: 2, landmarks: helperLandmarks(), inferenceMs: 8, error: null });
    await expect(second).resolves.toMatchObject({ capturedAtMs: 300 });
    vi.useRealTimers();
  });

  it("returns null for malformed output and restarts only after the cooldown", async () => {
    vi.useFakeTimers();
    let now = 1_000;
    const firstHarness = processHarness();
    const secondHarness = processHarness();
    const spawn = vi.fn()
      .mockReturnValueOnce(firstHarness.process)
      .mockReturnValueOnce(secondHarness.process);
    const client = new AppleVisionClient({ spawn, now: () => now, restartCooldownMs: 5_000 });

    const malformed = client.detect(new Uint8Array([1]), 0);
    firstHarness.process.stdout.on;
    firstHarness.emitLine({ id: 1, landmarks: [], inferenceMs: 1, error: null });
    await expect(malformed).resolves.toBeNull();

    const exiting = client.detect(new Uint8Array([2]), 10);
    firstHarness.emitExit();
    await expect(exiting).resolves.toBeNull();
    await expect(client.detect(new Uint8Array([3]), 20)).resolves.toBeNull();
    expect(spawn).toHaveBeenCalledTimes(1);

    now += 5_000;
    const restarted = client.detect(new Uint8Array([4]), 30);
    expect(spawn).toHaveBeenCalledTimes(2);
    secondHarness.emitLine({ id: 3, landmarks: helperLandmarks(), inferenceMs: 7, error: null });
    await expect(restarted).resolves.toMatchObject({ inferenceMs: 7 });
    vi.useRealTimers();
  });

  it("rejects invalid frames before spawning and disposes the helper", async () => {
    const harness = processHarness();
    const spawn = vi.fn(() => harness.process);
    const client = new AppleVisionClient({ spawn });

    await expect(client.detect(new Uint8Array(), 0)).rejects.toThrow("JPEG");
    await expect(client.detect(new Uint8Array(400 * 1024 + 1), 0)).rejects.toThrow("400 KiB");
    await expect(client.detect(new Uint8Array([1]), Number.NaN)).rejects.toThrow("timestamp");
    expect(spawn).not.toHaveBeenCalled();

    const pending = client.detect(new Uint8Array([1]), 0);
    client.dispose();
    await expect(pending).resolves.toBeNull();
    expect(harness.process.kill).toHaveBeenCalledOnce();
  });
});
