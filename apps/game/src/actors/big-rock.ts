import * as ex from "excalibur";
import { getRockBigAnimation } from "../systems/sprite-loader.ts";
import { ITEMS } from "../data/items.ts";
import type { Item } from "../types/item.ts";
import type { BigRockSaveState } from "../systems/save-manager.ts";
import { DamageFlash } from "./damage-flash.ts";
import { HealthBar } from "./health-bar.ts";

const TILE_SIZE = 32;
const DROP_EVERY = 20; // damage needed for each drop
const SHAKE_DURATION = 300; // ms

export class BigRock extends ex.Actor {
  readonly tileX: number;
  readonly tileY: number;
  readonly entityCategory = "mineable";

  damageAccum = 0;
  readonly dropThreshold = DROP_EVERY;
  private shakeTimer = 0;
  private shakeOriginX: number;
  private flash: DamageFlash;

  constructor(tileX: number, tileY: number) {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    super({
      pos: ex.vec(px, py),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 5,
    });
    this.tileX = tileX;
    this.tileY = tileY;
    this.shakeOriginX = px;
    this.graphics.use(getRockBigAnimation());
    this.flash = new DamageFlash(this);

    // Health bar — shows damage progress toward next drop, resets on drop
    const healthBar = new HealthBar({
      barWidth: 20,
      offsetY: -18,
      getHealth: () => ({
        current: DROP_EVERY - this.damageAccum,
        max: DROP_EVERY,
      }),
      shouldShow: () => this.damageAccum > 0,
    });
    this.addChild(healthBar);
  }

  /**
   * Apply damage and return any items that should drop.
   * Rolls the drop table once for every DROP_EVERY damage accumulated.
   */
  takeDamage(amount: number): Item[] {
    this.damageAccum += amount;
    this.startShake();
    this.flash.trigger();

    const drops: Item[] = [];
    while (this.damageAccum >= DROP_EVERY) {
      this.damageAccum -= DROP_EVERY;
      drops.push(this.rollDropTable());
    }
    return drops;
  }

  private rollDropTable(): Item {
    const roll = Math.random();
    if (roll < 0.4) {
      return { ...ITEMS["large_stone"] };
    } else if (roll < 0.8) {
      return { ...ITEMS["small_rock"] };
    } else {
      return { ...ITEMS["flint"] };
    }
  }

  private startShake(): void {
    this.shakeTimer = SHAKE_DURATION;
    this.shakeOriginX = this.tileX * TILE_SIZE + TILE_SIZE / 2;
  }

  getState(): BigRockSaveState {
    return {
      tileX: this.tileX,
      tileY: this.tileY,
      damageAccum: this.damageAccum,
    };
  }

  restoreState(state: BigRockSaveState): void {
    this.damageAccum = state.damageAccum ?? 0;
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    // Shake animation
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      const intensity = 2 * (this.shakeTimer / SHAKE_DURATION);
      this.pos.x = this.shakeOriginX + Math.sin(this.shakeTimer * 0.05) * intensity;
      if (this.shakeTimer <= 0) {
        this.pos.x = this.shakeOriginX;
        this.shakeTimer = 0;
      }
    }

    // Flash overlay
    this.flash.update(delta);
  }
}
