import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      onCameraRetry={vi.fn()}
    />,
  );

  await waitFor(() => expect(videoRef.current?.srcObject).toBe(stream));
  act(() => firstTrack.dispatchEvent(new Event("ended")));

  expect(onCameraError).toHaveBeenCalledWith(
    "Camera stream ended. Reconnect the camera, then retry.",
  );

  unmount();
  expect(firstTrack.stop).toHaveBeenCalledOnce();
  expect(secondTrack.stop).toHaveBeenCalledOnce();
});

it("offers a retry after camera failure and requests a new stream", async () => {
  const retryStream = Object.assign(new EventTarget(), {
    getTracks: () => [],
  }) as unknown as MediaStream;
  const getUserMedia = vi.fn()
    .mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"))
    .mockResolvedValueOnce(retryStream);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia },
  });
  const onCameraRetry = vi.fn();
  const videoRef = createRef<HTMLVideoElement>();

  render(
    <CameraStage
      videoRef={videoRef}
      landmarks={null}
      onCameraReady={vi.fn()}
      onCameraError={vi.fn()}
      onCameraRetry={onCameraRetry}
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(/permission was denied/i);
  fireEvent.click(screen.getByRole("button", { name: /retry camera/i }));

  expect(onCameraRetry).toHaveBeenCalledOnce();
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(videoRef.current?.srcObject).toBe(retryStream));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
