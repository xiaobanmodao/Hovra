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
  expect(getUserMedia).toHaveBeenCalledWith({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60 },
    },
  });
  act(() => firstTrack.dispatchEvent(new Event("ended")));

  expect(onCameraError).toHaveBeenCalledWith(
    "摄像头流已结束。请重新连接摄像头后重试。",
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

  expect(await screen.findByRole("alert")).toHaveTextContent("摄像头权限被拒绝。请允许摄像头访问后重试。");
  fireEvent.click(screen.getByRole("button", { name: "重试摄像头" }));

  expect(onCameraRetry).toHaveBeenCalledOnce();
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(videoRef.current?.srcObject).toBe(retryStream));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
