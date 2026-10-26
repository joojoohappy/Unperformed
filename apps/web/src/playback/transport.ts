/**
 * Playback transport. The audio clock is the master when sound is on; when
 * sound is off or unavailable, a performance.now() clock takes over. Visuals
 * always ask the transport for the current beat, never keep their own time.
 */
import type { PerformanceScore } from "@unperformed/performance-core";
import { AudioEngine } from "../audio/engine";

export type TransportState = "stopped" | "playing" | "paused";

export class Transport {
  readonly audio = new AudioEngine();
  state: TransportState = "stopped";
  private score: PerformanceScore | null = null;
  private useAudio = false;
  private wallStart = 0;
  private wallFrom = 0;
  private pausedBeat = 0;
  audioFailed = false;

  async play(score: PerformanceScore, fromBeat: number, sound: boolean): Promise<void> {
    this.score = score;
    this.useAudio = false;
    this.audioFailed = false;
    if (sound) {
      this.useAudio = await this.audio.play(score, fromBeat);
      this.audioFailed = !this.useAudio;
    } else {
      this.audio.stop();
    }
    this.wallFrom = fromBeat;
    this.wallStart = performance.now();
    this.state = "playing";
  }

  beat(): number {
    if (!this.score) return 0;
    if (this.state === "paused") return this.pausedBeat;
    if (this.state === "stopped") return this.pausedBeat;
    if (this.useAudio) return this.audio.beat();
    return this.wallFrom + ((performance.now() - this.wallStart) / 1000) * (this.score.tempoBpm / 60);
  }

  async pause(): Promise<void> {
    if (this.state !== "playing") return;
    this.pausedBeat = this.beat();
    this.state = "paused";
    if (this.useAudio) await this.audio.pause();
  }

  async resume(): Promise<void> {
    if (this.state !== "paused") return;
    if (this.useAudio) await this.audio.resume();
    else {
      this.wallFrom = this.pausedBeat;
      this.wallStart = performance.now();
    }
    this.state = "playing";
  }

  stop(): void {
    this.pausedBeat = this.state === "stopped" ? this.pausedBeat : this.beat();
    this.audio.stop();
    this.state = "stopped";
  }

  setVolume(v: number): void {
    this.audio.setVolume(v);
  }
}
