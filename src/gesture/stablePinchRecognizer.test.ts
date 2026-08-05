import { describe, expect, it } from "vitest";

import { StablePinchRecognizer, type StablePinchEvidence } from "./stablePinchRecognizer";

const contact = (overrides: Partial<StablePinchEvidence> = {}): StablePinchEvidence => ({
  contact: true,
  separated: false,
  blockingReason: "none",
  ...overrides,
});

const separated = (): StablePinchEvidence => ({
  contact: false,
  separated: true,
  blockingReason: "image",
});

describe("StablePinchRecognizer", () => {
  it("emits one click on the second consecutive contact frame", () => {
    const recognizer = new StablePinchRecognizer();

    expect(recognizer.update(contact(), 0)).toMatchObject({
      phase: "candidate",
      clicked: false,
      contactFrames: 1,
    });
    expect(recognizer.update(contact(), 16)).toMatchObject({
      phase: "active",
      clicked: true,
      contactFrames: 2,
    });
  });

  it("never repeats while held and rearms only after two separated frames", () => {
    const recognizer = new StablePinchRecognizer();
    recognizer.update(contact(), 0);
    expect(recognizer.update(contact(), 16).clicked).toBe(true);

    for (let at = 32; at <= 1_000; at += 16) {
      expect(recognizer.update(contact(), at).clicked).toBe(false);
    }

    expect(recognizer.update(separated(), 1_016).phase).toBe("releasing");
    expect(recognizer.update(separated(), 1_032).phase).toBe("neutral");
    expect(recognizer.update(contact(), 1_048).clicked).toBe(false);
    expect(recognizer.update(contact(), 1_064).clicked).toBe(true);
  });

  it("rejects a one-frame overlap and depth-blocked frames", () => {
    const recognizer = new StablePinchRecognizer();

    recognizer.update(contact(), 0);
    expect(recognizer.update(separated(), 16)).toMatchObject({ phase: "neutral", clicked: false });
    expect(recognizer.update(contact({ contact: false, blockingReason: "depth" }), 32).clicked).toBe(false);
    expect(recognizer.update(contact({ contact: false, blockingReason: "depth" }), 48).clicked).toBe(false);
  });

  it("resets an unfinished candidate across a dropped or stale frame", () => {
    const recognizer = new StablePinchRecognizer();

    recognizer.update(contact(), 0);
    expect(recognizer.update(null, 16).phase).toBe("lost");
    expect(recognizer.update(contact(), 32).clicked).toBe(false);
    expect(recognizer.update(contact(), 200).clicked).toBe(false);
    expect(recognizer.update(contact(), 216).clicked).toBe(true);
  });

  it("does not click on non-monotonic timestamps", () => {
    const recognizer = new StablePinchRecognizer();

    recognizer.update(contact(), 100);
    expect(recognizer.update(contact(), 90)).toMatchObject({ phase: "lost", clicked: false });
    expect(recognizer.update(contact(), 106).clicked).toBe(false);
    expect(recognizer.update(contact(), 122).clicked).toBe(true);
  });
});
