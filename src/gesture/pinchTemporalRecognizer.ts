import { PINCH_RELEASE_PROBABILITY } from "./config";
import type { PinchProbabilityResult } from "./pinchProbability";

export type PinchTemporalPhase =
  | "neutral"
  | "candidate"
  | "active"
  | "releasing"
  | "cooldown"
  | "lost";

export type PinchTemporalOutput = {
  phase: PinchTemporalPhase;
  confirmationProgress: number;
  activated: boolean;
  clicked: boolean;
  enterVotes: number;
  requiredVotes: number;
};

type EnterVote = { entered: boolean; mode: "normal" | "low-quality" | "dual" };

export class PinchTemporalRecognizer {
  private phase: PinchTemporalPhase = "neutral";
  private readonly enterWindow: EnterVote[] = [];
  private readonly releaseWindow: boolean[] = [];
  private cooldownStartedAt: number | null = null;
  private invalidStartedAt: number | null = null;
  private lastTimestampMs: number | null = null;

  update(
    result: PinchProbabilityResult | null,
    nowMs: number,
    usableForVoting: boolean,
    strictDualModelVoting = false,
  ): PinchTemporalOutput {
    if (!Number.isFinite(nowMs)) {
      this.reset();
      return this.output("lost");
    }
    if (this.lastTimestampMs !== null && nowMs < this.lastTimestampMs) this.reset();
    this.lastTimestampMs = nowMs;

    if (!result) return this.handleLost(nowMs);
    this.invalidStartedAt = null;

    if (this.phase === "cooldown") {
      if (
        this.cooldownStartedAt !== null
        && nowMs - this.cooldownStartedAt >= 70
        && result.probability <= PINCH_RELEASE_PROBABILITY
      ) {
        this.phase = "neutral";
        this.cooldownStartedAt = null;
      }
      return this.output(this.phase);
    }

    if (!usableForVoting) {
      const { enterVotes, requiredVotes } = this.currentVoteStats(strictDualModelVoting);
      return this.output(this.phase, false, false, enterVotes, requiredVotes);
    }
    if (this.phase === "active" || this.phase === "releasing") {
      return this.updateActive(result, nowMs);
    }
    return this.updateCandidate(result, strictDualModelVoting);
  }

  reset(): void {
    this.phase = "neutral";
    this.enterWindow.length = 0;
    this.releaseWindow.length = 0;
    this.cooldownStartedAt = null;
    this.invalidStartedAt = null;
    this.lastTimestampMs = null;
  }

  private updateCandidate(result: PinchProbabilityResult, strictDualModelVoting: boolean): PinchTemporalOutput {
    const lowQuality = result.worldQuality < 0.6;
    this.enterWindow.push({
      entered: result.safetyGatePassed && result.probability >= result.entryThreshold,
      mode: strictDualModelVoting ? "dual" : lowQuality ? "low-quality" : "normal",
    });
    const dualWindow = strictDualModelVoting || this.enterWindow.some((vote) => vote.mode === "dual");
    const lowQualityWindow = lowQuality || this.enterWindow.some((vote) => vote.mode === "low-quality");
    const windowSize = dualWindow ? 5 : lowQualityWindow ? 4 : 3;
    const requiredVotes = dualWindow || lowQualityWindow ? 3 : 2;
    while (this.enterWindow.length > windowSize) this.enterWindow.shift();
    const enterVotes = this.enterWindow.filter((vote) => vote.entered).length;

    if (enterVotes >= requiredVotes) {
      this.phase = "active";
      this.releaseWindow.length = 0;
      return this.output("active", true, false, enterVotes, requiredVotes);
    }
    const lastTwoReject = this.enterWindow.length >= 2
      && this.enterWindow.slice(-2).every((vote) => !vote.entered);
    if (lastTwoReject) {
      this.enterWindow.length = 0;
      this.phase = "neutral";
      return this.output("neutral", false, false, 0, requiredVotes);
    }
    this.phase = enterVotes > 0 ? "candidate" : "neutral";
    return this.output(this.phase, false, false, enterVotes, requiredVotes);
  }

  private updateActive(result: PinchProbabilityResult, nowMs: number): PinchTemporalOutput {
    this.releaseWindow.push(result.probability <= PINCH_RELEASE_PROBABILITY);
    while (this.releaseWindow.length > 3) this.releaseWindow.shift();
    const releaseVotes = this.releaseWindow.filter(Boolean).length;
    if (releaseVotes >= 2) {
      this.phase = "cooldown";
      this.cooldownStartedAt = nowMs;
      this.enterWindow.length = 0;
      this.releaseWindow.length = 0;
      return this.output("cooldown", false, true);
    }
    this.phase = releaseVotes > 0 ? "releasing" : "active";
    return this.output(this.phase);
  }

  private handleLost(nowMs: number): PinchTemporalOutput {
    this.invalidStartedAt ??= nowMs;
    if (this.phase !== "active" && this.phase !== "releasing") {
      this.enterWindow.length = 0;
      this.phase = "neutral";
      return this.output("lost");
    }
    if (nowMs - this.invalidStartedAt >= 120) {
      this.enterWindow.length = 0;
      this.releaseWindow.length = 0;
      this.phase = "neutral";
    }
    return this.output("lost");
  }

  private currentVoteStats(strictDualModelVoting = false): { enterVotes: number; requiredVotes: number } {
    return {
      enterVotes: this.enterWindow.filter((vote) => vote.entered).length,
      requiredVotes: strictDualModelVoting
        || this.enterWindow.some((vote) => vote.mode !== "normal") ? 3 : 2,
    };
  }

  private output(
    phase: PinchTemporalPhase,
    activated = false,
    clicked = false,
    enterVotes = 0,
    requiredVotes = 2,
  ): PinchTemporalOutput {
    return {
      phase,
      confirmationProgress: phase === "active" || phase === "releasing"
        ? 1
        : Math.min(1, enterVotes / requiredVotes),
      activated,
      clicked,
      enterVotes,
      requiredVotes,
    };
  }
}
