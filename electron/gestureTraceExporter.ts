import { dialog } from "electron";
import { writeFile } from "node:fs/promises";

import { parseGestureTrace } from "../src/gesture/gestureTrace";

export type GestureTraceSaveResult = "saved" | "cancelled";

export type GestureTraceExportDependencies = {
  showSaveDialog(options: {
    title: string;
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
};

const defaultDependencies: GestureTraceExportDependencies = {
  showSaveDialog: (options) => dialog.showSaveDialog(options),
  writeFile,
};

export async function saveGestureTrace(
  json: string,
  dependencies: GestureTraceExportDependencies = defaultDependencies,
): Promise<GestureTraceSaveResult> {
  const trace = parseGestureTrace(json);
  const result = await dependencies.showSaveDialog({
    title: "保存手势诊断记录",
    defaultPath: "gesture-trace.json",
    filters: [{ name: "手势诊断记录", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return "cancelled";

  await dependencies.writeFile(result.filePath, JSON.stringify(trace, null, 2), "utf8");
  return "saved";
}
