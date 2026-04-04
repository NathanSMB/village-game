import * as ex from "excalibur";

const FLASH_DURATION = 150; // ms
const FLASH_MAX_OPACITY = 0.7;

/**
 * Manages a white flash overlay effect for damageable entities.
 * Attach to an actor to show a brief white flash when damage is taken.
 */
export class DamageFlash {
  private overlay: ex.Actor;
  private flashTimer = 0;

  constructor(parent: ex.Actor, size = 32) {
    this.overlay = new ex.Actor({
      anchor: ex.vec(0.5, 0.5),
      z: 1, // relative z above parent
    });
    const white = new ex.Rectangle({
      width: size,
      height: size,
      color: ex.Color.White,
    });
    this.overlay.graphics.use(white);
    this.overlay.graphics.opacity = 0;
    parent.addChild(this.overlay);
  }

  /** Trigger the flash effect. */
  trigger(): void {
    this.flashTimer = FLASH_DURATION;
  }

  /** Update the flash timer. Call from the parent's onPreUpdate. */
  update(delta: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.flashTimer = 0;
        this.overlay.graphics.opacity = 0;
      } else {
        this.overlay.graphics.opacity = FLASH_MAX_OPACITY * (this.flashTimer / FLASH_DURATION);
      }
    }
  }
}
