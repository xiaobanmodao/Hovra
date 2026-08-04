import type { PinchCalibrationChannel } from "./pinchCalibration";

const FAILURE_GUIDANCE: Record<PinchCalibrationChannel, string> = {
  image: "画面距离不足：真实接触时让两指更紧，假重合时保持画面重合。",
  world: "三维距离不足：假重合时增加两指的实际空间距离。",
  depth: "前后深度不足：让两指沿摄像头前后方向分开更多。",
};

export function calibrationFailureGuidance(
  failedChannels: PinchCalibrationChannel[],
): string[] {
  return failedChannels.map((channel) => FAILURE_GUIDANCE[channel]);
}
