import * as ex from "excalibur";
import { getTreeAnimation, getTreeStumpAnimation } from "../systems/sprite-loader.ts";
import { ITEMS } from "../data/items.ts";
import type { Item } from "../types/item.ts";
import type { TreeSaveState } from "../systems/save-manager.ts";
import { DamageFlash } from "./damage-flash.ts";
import { HealthBar } from "./health-bar.ts";

const TILE_SIZE = 32;
const MAX_HP = 200;
const DROP_INTERVAL_MS = 60_000; // 60 seconds between timed branch drops
const BRANCH_DROP_EVERY = 50; // damage needed for each branch drop
const REGROW_MS = 300_000; // 5 minutes to regrow from stump
const LOGS_ON_DEATH = 6;
const SHAKE_DURATION = 300; // ms

export class Tree extends ex.Actor {
  readonly tileX: number;
  readonly tileY: number;
  readonly entityCategory = "tree";

  private treeAnim: ex.Animation;
  private stumpAnim: ex.Animation;
  private dropTimer: number;
  private pendingDrop = false;

  /** Number of branches this tree currently has on the ground. Managed by GameWorld. */
  branchCount = 0;

  // Chopping mechanics
  hp = MAX_HP;
  readonly maxHp = MAX_HP;
  private damageAccum = 0;
  private _isStump = false;
  private regrowTimer = 0;

  // Visual feedback
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
    this.treeAnim = getTreeAnimation();
    this.stumpAnim = getTreeStumpAnimation();
    this.graphics.use(this.treeAnim);
    this.flash = new DamageFlash(this);

    // Health bar — shows when damaged
    const healthBar = new HealthBar({
      barWidth: 20,
      offsetY: -18,
      getHealth: () => ({ current: this.hp, max: this.maxHp }),
      shouldShow: () => !this._isStump && this.hp < this.maxHp,
    });
    this.addChild(healthBar);

    // Stagger initial drop timer so trees don't all drop at once
    this.dropTimer = Math.random() * DROP_INTERVAL_MS;
  }

  /**
   * Check if the tree wants to drop a branch. Returns true once and resets.
   * Called by GameWorld each frame via onPreUpdate.
   */
  consumePendingDrop(): boolean {
    if (this.pendingDrop) {
      this.pendingDrop = false;
      return true;
    }
    return false;
  }

  /** Whether this tree has been chopped down and is currently a stump. */
  isChoppedDown(): boolean {
    return this._isStump;
  }

  /**
   * Apply damage. Returns branches from accumulated damage and logs on death.
   */
  takeDamage(amount: number): { destroyed: boolean; drops: Item[] } {
    if (this._isStump) return { destroyed: false, drops: [] };

    this.hp = Math.max(0, this.hp - amount);
    this.damageAccum += amount;
    this.startShake();
    this.flash.trigger();

    const drops: Item[] = [];

    // Drop a branch for every BRANCH_DROP_EVERY damage accumulated
    while (this.damageAccum >= BRANCH_DROP_EVERY) {
      this.damageAccum -= BRANCH_DROP_EVERY;
      // Only drop branch if tree is still alive after this check
      if (this.hp > 0) {
        drops.push({ ...ITEMS["branch"] });
      }
    }

    if (this.hp <= 0) {
      // Tree is chopped down — become a stump
      this._isStump = true;
      this.regrowTimer = REGROW_MS;
      this.damageAccum = 0;
      this.graphics.use(this.stumpAnim);

      // Drop logs
      for (let i = 0; i < LOGS_ON_DEATH; i++) {
        drops.push({ ...ITEMS["log"] });
      }

      return { destroyed: true, drops };
    }

    return { destroyed: false, drops };
  }

  getState(): TreeSaveState {
    return {
      tileX: this.tileX,
      tileY: this.tileY,
      dropTimer: this.dropTimer,
      branchCount: this.branchCount,
      hp: this.hp,
      isStump: this._isStump,
      regrowTimer: this.regrowTimer,
      damageAccum: this.damageAccum,
    };
  }

  restoreState(state: TreeSaveState): void {
    this.dropTimer = state.dropTimer;
    this.branchCount = state.branchCount;
    this.hp = state.hp ?? MAX_HP;
    this._isStump = state.isStump ?? false;
    this.regrowTimer = state.regrowTimer ?? 0;
    this.damageAccum = state.damageAccum ?? 0;

    if (this._isStump) {
      this.graphics.use(this.stumpAnim);
    }
  }

  private startShake(): void {
    this.shakeTimer = SHAKE_DURATION;
    this.shakeOriginX = this.tileX * TILE_SIZE + TILE_SIZE / 2;
  }

  private regrow(): void {
    this._isStump = false;
    this.hp = MAX_HP;
    this.damageAccum = 0;
    this.regrowTimer = 0;
    this.dropTimer = DROP_INTERVAL_MS;
    this.graphics.use(this.treeAnim);
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

    if (this._isStump) {
      // Count down regrow timer
      this.regrowTimer -= delta;
      if (this.regrowTimer <= 0) {
        this.regrow();
      }
      return; // Skip branch drop timer while stump
    }

    // Timed branch drop timer (only when alive)
    // Branches despawn naturally after DESPAWN_MS, so no cap needed.
    this.dropTimer -= delta;
    if (this.dropTimer <= 0) {
      this.dropTimer = DROP_INTERVAL_MS;
      this.pendingDrop = true;
    }
  }
}
