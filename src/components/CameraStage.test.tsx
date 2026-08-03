import { createRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CameraStage } from "./CameraStage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("reports an ended camera stream and stops every track on cleanup", async () => {
  const firstTrack = Object.assign(new EventTarget(), { stop: vi.fn() });
  const secondTrack = Object.assign(new EventTarget(), { stop: vi.fn() });
  const stream = Object.assign(new EventTarget(), {
    getTracks: () => [firstTrack, secondTrack],
  }) as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia },
  });
  const onCameraError = vi.fn();
  const videoRef = createRef<HTMLVideoElement>();

  const { unmount } = render(
    <CameraStage
      videoRef={videoRef}
      landmarks={null}
      onCameraReady={vi.fn()}
      onCameraError={onCameraError}
    />,
  );

  await waitFor(() => expect(videoRef.current?.srcObject).toBe(stream));
  act(() => firstTrack.dispatchEvent(new Event("ended")));

  expect(onCameraError).toHaveBeenCalledWith(
    "Camera stream ended. Reconnect the camera and reload to try again.",
  );

  unmount();
  expect(firstTrack.stop).toHaveBeenCalledOnce();
  expect(secondTrack.stop).toHaveBeenCalledOnce();
});
