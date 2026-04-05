import type * as ex from "excalibur";

const FLASH_DURATION = 150; // ms
const BLINK_INTERVAL = 50; // ms per half-cycle

/**
 * Manages a damage flash effect by blinking the parent actor's graphics.
 * The actual entity sprite flashes instead of showing a separate overlay.
 */
export class DamageFlash {
  private parent: ex.Actor;
  private flashTimer = 0;

  constructor(parent: ex.Actor, _size = 32) {
    this.parent = parent;
  }

  /** Trigger the flash effect. */
  trigger(): void {
    this.flashTimer = FLASH_DURATION;
  }

  /** Whether the flash is currently active. */
  isActive(): boolean {
    return this.flashTimer > 0;
  }

  /** Update the flash timer. Call from the parent's onPreUpdate. */
  update(delta: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.flashTimer = 0;
        this.parent.graphics.opacity = 1;
      } else {
        // Rapid blink: odd phases dim the sprite, even phases restore it
        const phase = Math.floor(this.flashTimer / BLINK_INTERVAL);
        this.parent.graphics.opacity = phase % 2 !== 0 ? 0.15 : 1;
      }
    }
  }
}
