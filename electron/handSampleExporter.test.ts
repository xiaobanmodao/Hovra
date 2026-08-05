import { describe, expect, it, vi } from "vitest";

import type { HandSample } from "../src/vision/handSample";
import { saveHandSample, type HandSampleExportDependencies } from "./handSampleExporter";

const sample: HandSample = {
  version: 1,
  capturedAtMs: 120,
  imageAspectRatio: 1,
  jpegBase64: "/9j/2Q==",
  mediaPipeLandmarks: null,
  mediaPipeWorldLandmarks: null,
  appleVision: null,
  diagnostics: {
    palmFacingScore: null,
    mediaPipePinchRatio: null,
    visionPinchRatio: null,
    visionConfidence: null,
    modelAgreement: null,
    blockingReason: null,
  },
};

const dependencies = (filePath: string | null = "/tmp/hand-sample.json") => ({
  showSaveDialog: vi.fn().mockResolvedValue({
    canceled: filePath === null,
    ...(filePath ? { filePath } : {}),
  }),
  writeFile: vi.fn().mockResolvedValue(undefined),
}) satisfies HandSampleExportDependencies;

describe("saveHandSample", () => {
  it("writes a validated JSON sample only after the save dialog", async () => {
    const deps = dependencies();
    await expect(saveHandSample(JSON.stringify(sample), deps)).resolves.toBe("saved");
    expect(deps.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: "保存当前手部样本（仅本机）",
      filters: [{ name: "手部识别样本", extensions: ["json"] }],
    }));
    expect(deps.writeFile).toHaveBeenCalledWith(
      "/tmp/hand-sample.json",
      JSON.stringify(sample, null, 2),
      "utf8",
    );
  });

  it("does not open a dialog for invalid data and does not write after cancellation", async () => {
    const invalid = dependencies();
    await expect(saveHandSample('{"version":1}', invalid)).rejects.toThrow();
    expect(invalid.showSaveDialog).not.toHaveBeenCalled();

    const cancelled = dependencies(null);
    await expect(saveHandSample(JSON.stringify(sample), cancelled)).resolves.toBe("cancelled");
    expect(cancelled.writeFile).not.toHaveBeenCalled();
  });
});
