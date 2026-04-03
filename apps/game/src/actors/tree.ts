import * as ex from "excalibur";
import { getTreeAnimation } from "../systems/sprite-loader.ts";
import type { TreeSaveState } from "../systems/save-manager.ts";

const TILE_SIZE = 32;
const DROP_INTERVAL_MS = 60_000; // 60 seconds between branch drops
const MAX_BRANCHES = 3;

export class Tree extends ex.Actor {
  readonly tileX: number;
  readonly tileY: number;
  private anim: ex.Animation;
  private dropTimer: number;
  private pendingDrop = false;
  /** Number of branches this tree currently has on the ground. Managed by GameWorld. */
  branchCount = 0;

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
    this.anim = getTreeAnimation();
    this.graphics.use(this.anim);
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

  getState(): TreeSaveState {
    return {
      tileX: this.tileX,
      tileY: this.tileY,
      dropTimer: this.dropTimer,
      branchCount: this.branchCount,
    };
  }

  restoreState(state: TreeSaveState): void {
    this.dropTimer = state.dropTimer;
    this.branchCount = state.branchCount;
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    // Drop timer
    if (this.branchCount < MAX_BRANCHES) {
      this.dropTimer -= delta;
      if (this.dropTimer <= 0) {
        this.dropTimer = DROP_INTERVAL_MS;
        this.pendingDrop = true;
      }
    } else {
      // Reset timer so it starts fresh when a branch is picked up
      this.dropTimer = DROP_INTERVAL_MS;
    }
  }
}
