import type { GestureCandidate, GestureKind, GesturePhase } from "./types";

export type GestureStabilizerOptions = {
  entryMs?: number;
  scrollEntryMs?: number;
  releaseMs?: number;
  cooldownMs?: number;
  dropoutGraceMs?: number;
};

export type GestureStabilizerOutput = {
  phase: GesturePhase;
  candidate: GestureKind | null;
  lockedGesture: GestureKind | null;
  confirmationProgress: number;
  activated: GestureKind | null;
  released: GestureKind | null;
  timedOut: boolean;
};

export class GestureStabilizer {
  private readonly entryMs: number;
  private readonly scrollEntryMs: number;
  private readonly releaseMs: number;
  private readonly cooldownMs: number;
  private readonly dropoutGraceMs: number;
  private candidateKind: GestureKind | null = null;
  private candidateStartedAt: number | null = null;
  private lockedKind: GestureKind | null = null;
  private releaseStartedAt: number | null = null;
  private invalidStartedAt: number | null = null;
  private cooldownUntil: number | null = null;
  private lastTimestampMs: number | null = null;

  constructor(options: GestureStabilizerOptions = {}) {
    this.entryMs = validDuration(options.entryMs, 80);
    this.scrollEntryMs = validDuration(options.scrollEntryMs, 100);
    this.releaseMs = validDuration(options.releaseMs, 60);
    this.cooldownMs = validDuration(options.cooldownMs, 120);
    this.dropoutGraceMs = validDuration(options.dropoutGraceMs, 120);
  }

  update(
    candidate: GestureCandidate | null,
    nowMs: number,
    inputValid = true,
  ): GestureStabilizerOutput {
    if (!Number.isFinite(nowMs)) {
      this.reset();
      return this.output("lost", null, null, 0, false);
    }
    if (this.lastTimestampMs !== null && nowMs < this.lastTimestampMs) {
      this.reset();
    }
    const elapsedSinceLastUpdate = this.lastTimestampMs === null ? 0 : nowMs - this.lastTimestampMs;
    this.lastTimestampMs = nowMs;

    if (!inputValid) {
      return this.handleInvalid(nowMs, elapsedSinceLastUpdate);
    }
    this.invalidStartedAt = null;

    if (this.cooldownUntil !== null) {
      if (nowMs < this.cooldownUntil) {
        return this.output("cooldown", null, null, 0, false);
      }
      this.cooldownUntil = null;
    }

    if (this.lockedKind !== null) {
      return this.updateLocked(candidate, nowMs);
    }
    return this.updateCandidate(candidate, nowMs);
  }

  reset(): void {
    this.candidateKind = null;
    this.candidateStartedAt = null;
    this.lockedKind = null;
    this.releaseStartedAt = null;
    this.invalidStartedAt = null;
    this.cooldownUntil = null;
    this.lastTimestampMs = null;
  }

  get lockedGesture(): GestureKind | null {
    return this.lockedKind;
  }

  private updateCandidate(candidate: GestureCandidate | null, nowMs: number): GestureStabilizerOutput {
    if (!candidate) {
      this.candidateKind = null;
      this.candidateStartedAt = null;
      return this.output("neutral", null, null, 0, false);
    }

    if (this.candidateKind !== candidate.kind) {
      this.candidateKind = candidate.kind;
      this.candidateStartedAt = nowMs;
    }
    const requiredMs = candidate.kind === "scroll" ? this.scrollEntryMs : this.entryMs;
    const elapsed = nowMs - (this.candidateStartedAt ?? nowMs);
    const progress = Math.max(0, Math.min(1, elapsed / requiredMs));
    if (elapsed < requiredMs) {
      return this.output("candidate", candidate.kind, null, progress, false);
    }

    this.lockedKind = candidate.kind;
    this.releaseStartedAt = null;
    return this.output("active", candidate.kind, candidate.kind, 1, false, candidate.kind);
  }

  private updateLocked(candidate: GestureCandidate | null, nowMs: number): GestureStabilizerOutput {
    const locked = this.lockedKind!;
    if (candidate?.kind === locked) {
      this.releaseStartedAt = null;
      return this.output("active", locked, locked, 1, false);
    }

    if (this.releaseStartedAt === null) {
      this.releaseStartedAt = nowMs;
    }
    if (nowMs - this.releaseStartedAt < this.releaseMs) {
      return this.output("releasing", locked, locked, 1, false);
    }

    this.lockedKind = null;
    this.candidateKind = null;
    this.candidateStartedAt = null;
    this.releaseStartedAt = null;
    this.cooldownUntil = nowMs + this.cooldownMs;
    return this.output("cooldown", null, null, 0, false, null, locked);
  }

  private handleInvalid(nowMs: number, elapsedSinceLastUpdate: number): GestureStabilizerOutput {
    this.candidateKind = null;
    this.candidateStartedAt = null;
    if (this.lockedKind === null) {
      this.invalidStartedAt ??= nowMs;
      return this.output("lost", null, null, 0, false);
    }

    this.invalidStartedAt ??= nowMs - Math.max(0, elapsedSinceLastUpdate);
    if (nowMs - this.invalidStartedAt < this.dropoutGraceMs) {
      return this.output("lost", this.lockedKind, this.lockedKind, 1, false);
    }

    this.lockedKind = null;
    this.releaseStartedAt = null;
    this.invalidStartedAt = null;
    this.cooldownUntil = nowMs + this.cooldownMs;
    return this.output("lost", null, null, 0, true);
  }

  private output(
    phase: GesturePhase,
    candidate: GestureKind | null,
    lockedGesture: GestureKind | null,
    confirmationProgress: number,
    timedOut: boolean,
    activated: GestureKind | null = null,
    released: GestureKind | null = null,
  ): GestureStabilizerOutput {
    return {
      phase,
      candidate,
      lockedGesture,
      confirmationProgress,
      activated,
      released,
      timedOut,
    };
  }
}

function validDuration(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
