import * as ex from "excalibur";
import {
  getBerryBushFullAnimation,
  getBerryBushPickedAnimation,
} from "../systems/sprite-loader.ts";
import { ITEMS } from "../data/items.ts";
import type { Item } from "../types/item.ts";
import type { BerryBushSaveState } from "../systems/save-manager.ts";

const TILE_SIZE = 32;
const REGROW_MS = 60_000; // 60 seconds to regrow berries

export class BerryBush extends ex.Actor {
  readonly tileX: number;
  readonly tileY: number;
  private hasBerries = true;
  private regrowTimer = 0;
  private fullAnim: ex.Animation;
  private pickedAnim: ex.Animation;
  private shakeTimer = 0;
  private shakeOriginX: number;

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
    this.fullAnim = getBerryBushFullAnimation();
    this.pickedAnim = getBerryBushPickedAnimation();
    this.graphics.use(this.fullAnim);
  }

  /** Try to pick berries. Returns a berry Item if successful, null otherwise. */
  pick(): Item | null {
    if (!this.hasBerries) return null;
    this.hasBerries = false;
    this.regrowTimer = REGROW_MS;
    this.graphics.use(this.pickedAnim);
    this.startShake();
    return { ...ITEMS["berry"] };
  }

  canPick(): boolean {
    return this.hasBerries;
  }

  getState(): BerryBushSaveState {
    return {
      tileX: this.tileX,
      tileY: this.tileY,
      hasBerries: this.hasBerries,
      regrowTimer: this.regrowTimer,
    };
  }

  restoreState(state: BerryBushSaveState): void {
    this.hasBerries = state.hasBerries;
    this.regrowTimer = state.regrowTimer;
    this.graphics.use(this.hasBerries ? this.fullAnim : this.pickedAnim);
  }

  private startShake(): void {
    this.shakeTimer = 400; // shake for 400ms
    this.shakeOriginX = this.pos.x;
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    // Shake animation
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      const intensity = 2 * (this.shakeTimer / 400);
      this.pos.x = this.shakeOriginX + Math.sin(this.shakeTimer * 0.05) * intensity;
      if (this.shakeTimer <= 0) {
        this.pos.x = this.shakeOriginX;
        this.shakeTimer = 0;
      }
    }

    // Regrow timer
    if (!this.hasBerries) {
      this.regrowTimer -= delta;
      if (this.regrowTimer <= 0) {
        this.hasBerries = true;
        this.regrowTimer = 0;
        this.graphics.use(this.fullAnim);
      }
    }
  }
}
