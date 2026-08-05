import { describe, expect, it, vi } from "vitest";

import { saveGestureTrace, type GestureTraceExportDependencies } from "./gestureTraceExporter";

const validTrace = JSON.stringify({ version: 1, frames: [] });

const dependencies = (filePath: string | null = "/tmp/gesture-trace.json") => ({
  showSaveDialog: vi.fn().mockResolvedValue({
    canceled: filePath === null,
    ...(filePath === null ? {} : { filePath }),
  }),
  writeFile: vi.fn().mockResolvedValue(undefined),
}) satisfies GestureTraceExportDependencies;

describe("saveGestureTrace", () => {
  it("shows a JSON-only save dialog and writes validated UTF-8 trace data", async () => {
    const deps = dependencies();

    await expect(saveGestureTrace(validTrace, deps)).resolves.toBe("saved");
    expect(deps.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: "保存手势诊断记录",
      defaultPath: "gesture-trace.json",
      filters: [{ name: "手势诊断记录", extensions: ["json"] }],
    }));
    expect(deps.writeFile).toHaveBeenCalledWith(
      "/tmp/gesture-trace.json",
      JSON.stringify({ version: 5, frames: [] }, null, 2),
      "utf8",
    );
  });

  it("does not write when the user cancels", async () => {
    const deps = dependencies(null);
    await expect(saveGestureTrace(validTrace, deps)).resolves.toBe("cancelled");
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("rejects malformed traces and reports write failures", async () => {
    const deps = dependencies();
    await expect(saveGestureTrace('{"version":6,"frames":[]}', deps)).rejects.toThrow();
    expect(deps.showSaveDialog).not.toHaveBeenCalled();

    const failing = dependencies();
    failing.writeFile.mockRejectedValue(new Error("disk full"));
    await expect(saveGestureTrace(validTrace, failing)).rejects.toThrow("disk full");
  });
});
