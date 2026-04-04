/**
 * Cow — a passive creature similar to sheep.
 *
 * Passive behavior: wanders randomly when idle, follows the player when pet.
 * Drops cow hide and raw beef on death.
 */
import type { Item } from "../types/item.ts";
import type { Direction } from "./player.ts";
import { Creature } from "./creature.ts";
import { ITEMS } from "../data/items.ts";
import { findPath } from "../systems/pathfinding.ts";
import type { CowSaveState } from "../systems/save-manager.ts";

const COW_HP = 40;
const COW_SPEED = 70; // px/sec — slightly slower than sheep
const WANDER_MIN_MS = 2000;
const WANDER_MAX_MS = 5000;
const PATH_RECALC_MS = 500; // recalculate following path every 500ms
const FOLLOW_STOP_DISTANCE = 1; // stop when 1 tile away from player

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

function randomWanderDelay(): number {
  return WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS);
}

export class Cow extends Creature {
  following = false;
  private wanderTimer: number;
  private pathQueue: { x: number; y: number }[] = [];
  private pathRecalcTimer = 0;
  private lastPlayerTileX = -1;
  private lastPlayerTileY = -1;

  constructor(tileX: number, tileY: number) {
    super(tileX, tileY, {
      behavior: "passive",
      category: "creature",
      hp: COW_HP,
      speed: COW_SPEED,
    });
    this.wanderTimer = randomWanderDelay();
  }

  protected override getDrops(): Item[] {
    return [{ ...ITEMS["cow_hide"] }, { ...ITEMS["raw_beef"] }];
  }

  /** Toggle follow state. Returns the new state. */
  toggleFollow(): boolean {
    this.following = !this.following;
    this.pathQueue = [];
    this.pathRecalcTimer = 0;
    return this.following;
  }

  /**
   * Update AI behavior each frame.
   *
   * @param playerTileX  Current player tile X (for following)
   * @param playerTileY  Current player tile Y (for following)
   * @param playerFacing Player facing direction (for positioning behind player)
   */
  updateAI(delta: number, playerTileX: number, playerTileY: number, playerFacing: Direction): void {
    if (this.isDead) return;

    if (this.following) {
      this.updateFollowing(delta, playerTileX, playerTileY, playerFacing);
    } else {
      this.updateWandering(delta);
    }
  }

  private updateWandering(delta: number): void {
    if (this.isMoving()) return;

    this.wanderTimer -= delta;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = randomWanderDelay();

      // Try a random direction
      const shuffled = [...DIRECTIONS].sort(() => Math.random() - 0.5);
      for (const dir of shuffled) {
        if (this.moveToTile(dir)) break;
      }
    }
  }

  private updateFollowing(
    delta: number,
    playerTileX: number,
    playerTileY: number,
    playerFacing: Direction,
  ): void {
    if (this.isMoving()) return;

    // Check if already adjacent to player
    const dx = Math.abs(this.tileX - playerTileX);
    const dy = Math.abs(this.tileY - playerTileY);
    const manhattanDist = dx + dy;
    if (manhattanDist <= FOLLOW_STOP_DISTANCE) {
      // Close enough, just face the player
      this.pathQueue = [];
      return;
    }

    // Recalculate path if timer expired or player moved
    this.pathRecalcTimer -= delta;
    const playerMoved =
      playerTileX !== this.lastPlayerTileX || playerTileY !== this.lastPlayerTileY;

    if (this.pathRecalcTimer <= 0 || playerMoved || this.pathQueue.length === 0) {
      this.pathRecalcTimer = PATH_RECALC_MS;
      this.lastPlayerTileX = playerTileX;
      this.lastPlayerTileY = playerTileY;

      // Target: tile behind the player (opposite of facing), fallback to adjacent tiles
      const target = this.getFollowTarget(playerTileX, playerTileY, playerFacing);
      if (target) {
        this.pathQueue =
          findPath(this.tileX, this.tileY, target.x, target.y, (fx, fy, tx, ty) =>
            this.isBlocked(fx, fy, tx, ty),
          ) ?? [];
      } else {
        this.pathQueue = [];
      }
    }

    // Pop next step from path and move
    if (this.pathQueue.length > 0) {
      const next = this.pathQueue.shift()!;
      this.moveTowardTile(next.x, next.y);
    }
  }

  /**
   * Find the best tile to follow to — behind the player or any adjacent tile.
   */
  private getFollowTarget(
    playerTileX: number,
    playerTileY: number,
    playerFacing: Direction,
  ): { x: number; y: number } | null {
    // Opposite of player facing
    const behindDirs: Direction[] = (() => {
      switch (playerFacing) {
        case "up":
          return ["down", "left", "right", "up"];
        case "down":
          return ["up", "left", "right", "down"];
        case "left":
          return ["right", "up", "down", "left"];
        case "right":
          return ["left", "up", "down", "right"];
      }
    })();

    const DX: Record<Direction, number> = { left: -1, right: 1, up: 0, down: 0 };
    const DY: Record<Direction, number> = { up: -1, down: 1, left: 0, right: 0 };

    for (const dir of behindDirs) {
      const tx = playerTileX + DX[dir];
      const ty = playerTileY + DY[dir];
      if (tx >= 0 && tx < 64 && ty >= 0 && ty < 64) {
        // Check if this tile is reachable (not blocked from the player's tile)
        if (!this.isBlocked(playerTileX, playerTileY, tx, ty)) {
          return { x: tx, y: ty };
        }
      }
    }

    // All adjacent tiles blocked — just target the player tile directly
    return { x: playerTileX, y: playerTileY };
  }

  getState(): CowSaveState {
    return {
      tileX: this.tileX,
      tileY: this.tileY,
      hp: this.hp,
      following: this.following,
    };
  }

  restoreState(state: CowSaveState): void {
    this.hp = state.hp;
    this.following = state.following;
    if (this.hp <= 0) {
      this.isDead = true;
    }
  }
}
