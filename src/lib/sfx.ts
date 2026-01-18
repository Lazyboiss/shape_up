// src/lib/sfx.ts
type SfxKey = "jump" | "win" | "lose" | "flag" | "countBeep" | "countGo";

type SfxMap = Record<SfxKey, string>;

export class SfxManager {
  private unlocked = false;
  private map: SfxMap;
  private volume: Partial<Record<SfxKey, number>>;

  constructor(map: SfxMap, volume?: Partial<Record<SfxKey, number>>) {
    this.map = map;
    this.volume = volume ?? {};
  }

  /** Call once from any user gesture (click/button press). */
  async unlock() {
    if (this.unlocked) return;

    // Create a silent-ish play attempt to satisfy autoplay policies.
    // Some browsers require actual audio playback to mark as "user initiated".
    const a = new Audio(this.map.jump);
    a.volume = 0.0001;
    try {
      await a.play();
      a.pause();
      a.currentTime = 0;
      this.unlocked = true;
    } catch {
      // It's ok—user can still trigger play() later inside gestures.
      this.unlocked = true;
    }
  }

  /** Plays with overlap support (creates a new Audio each time). */
  play(key: SfxKey) {
    const src = this.map[key];
    if (!src) return;

    const a = new Audio(src);
    a.preload = "auto";
    a.volume = this.volume[key] ?? 0.8;

    // Don't throw if blocked—just log.
    a.play().catch((err) => {
      console.warn(`SFX blocked (${key}):`, err);
    });
  }
}
