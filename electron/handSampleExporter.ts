import { dialog } from "electron";
import { writeFile } from "node:fs/promises";

import { parseHandSample } from "../src/vision/handSample";

export type HandSampleExportDependencies = {
  showSaveDialog(options: {
    title: string;
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
};

const defaultDependencies: HandSampleExportDependencies = {
  showSaveDialog: (options) => dialog.showSaveDialog(options),
  writeFile,
};

export async function saveHandSample(
  json: string,
  dependencies: HandSampleExportDependencies = defaultDependencies,
): Promise<"saved" | "cancelled"> {
  const sample = parseHandSample(json);
  const result = await dependencies.showSaveDialog({
    title: "保存当前手部样本（仅本机）",
    defaultPath: "hand-recognition-sample.json",
    filters: [{ name: "手部识别样本", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return "cancelled";
  await dependencies.writeFile(result.filePath, JSON.stringify(sample, null, 2), "utf8");
  return "saved";
}
