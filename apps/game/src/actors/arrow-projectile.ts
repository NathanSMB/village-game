import * as ex from "excalibur";
import { getItemSprite } from "../systems/sprite-loader.ts";

type Direction = "down" | "up" | "left" | "right";

const TILE_SIZE = 32;
const ARROW_SPEED = 320; // pixels per second (~10 tiles/sec)

const DIR_DX: Record<Direction, number> = { left: -1, right: 1, up: 0, down: 0 };
const DIR_DY: Record<Direction, number> = { up: -1, down: 1, left: 0, right: 0 };

// Rotation angles so the arrow sprite faces the direction of travel
const DIR_ROTATION: Record<Direction, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};

export interface ArrowProjectileOpts {
  /** Tile X the arrow starts on (player's facing tile). */
  startTileX: number;
  /** Tile Y the arrow starts on (player's facing tile). */
  startTileY: number;
  /** Direction of travel. */
  direction: Direction;
  /** Max range in tiles before the arrow despawns. */
  maxRange: number;
  /**
   * Called when the arrow arrives at a new tile.
   * Return true if the arrow hit something and should stop.
   */
  onTileReached: (tileX: number, tileY: number) => boolean;
  /**
   * Called to check if the edge between two adjacent tiles is blocked (wall/fence).
   * Return true if the arrow cannot pass through.
   */
  isEdgeBlocked: (fromTX: number, fromTY: number, toTX: number, toTY: number) => boolean;
}

/**
 * Arrow projectile that flies in a straight line through tiles.
 * Checks each tile it enters for targets via the `onTileReached` callback.
 * Self-destructs on hit, on max range, on blocked edge, or if it leaves the map.
 */
export class ArrowProjectile extends ex.Actor {
  private direction: Direction;
  private maxRange: number;
  private onTileReached: (tileX: number, tileY: number) => boolean;
  private isEdgeBlocked: (fromTX: number, fromTY: number, toTX: number, toTY: number) => boolean;
  private tilesTraveled = 0;
  private currentTileX: number;
  private currentTileY: number;
  private nextTileX: number;
  private nextTileY: number;

  constructor(opts: ArrowProjectileOpts) {
    const startX = opts.startTileX * TILE_SIZE + TILE_SIZE / 2;
    const startY = opts.startTileY * TILE_SIZE + TILE_SIZE / 2;

    super({
      pos: ex.vec(startX, startY),
      anchor: ex.vec(0.5, 0.5),
      z: 40,
    });

    this.direction = opts.direction;
    this.maxRange = opts.maxRange;
    this.onTileReached = opts.onTileReached;
    this.isEdgeBlocked = opts.isEdgeBlocked;
    this.currentTileX = opts.startTileX;
    this.currentTileY = opts.startTileY;

    // Set velocity
    const dx = DIR_DX[this.direction];
    const dy = DIR_DY[this.direction];
    this.vel = ex.vec(dx * ARROW_SPEED, dy * ARROW_SPEED);

    // Pre-compute next tile
    this.nextTileX = this.currentTileX + dx;
    this.nextTileY = this.currentTileY + dy;

    // Set up the arrow sprite
    const sprite = getItemSprite("arrow");
    if (sprite) {
      const cloned = sprite.clone();
      cloned.rotation = DIR_ROTATION[this.direction];
      this.graphics.use(cloned);
    }

    // Check the starting tile immediately
    if (this.onTileReached(this.currentTileX, this.currentTileY)) {
      // Hit something on spawn tile — kill immediately after being added to scene
      this.once("initialize", () => this.kill());
      return;
    }
  }

  override onPreUpdate(_engine: ex.Engine, _delta: number): void {
    // Check if we've reached the center of the next tile
    const dx = DIR_DX[this.direction];
    const dy = DIR_DY[this.direction];
    const nextCenterX = this.nextTileX * TILE_SIZE + TILE_SIZE / 2;
    const nextCenterY = this.nextTileY * TILE_SIZE + TILE_SIZE / 2;

    // Has the arrow passed or reached the next tile center?
    const passedX = dx === 0 || (dx > 0 ? this.pos.x >= nextCenterX : this.pos.x <= nextCenterX);
    const passedY = dy === 0 || (dy > 0 ? this.pos.y >= nextCenterY : this.pos.y <= nextCenterY);

    if (passedX && passedY) {
      // Check if edge between current tile and next tile is blocked (wall/fence)
      if (
        this.isEdgeBlocked(this.currentTileX, this.currentTileY, this.nextTileX, this.nextTileY)
      ) {
        this.vel = ex.vec(0, 0);
        this.kill();
        return;
      }

      this.tilesTraveled++;
      this.currentTileX = this.nextTileX;
      this.currentTileY = this.nextTileY;

      // Snap to exact tile center to prevent drift
      this.pos.x = nextCenterX;
      this.pos.y = nextCenterY;

      // Check for hit at this tile
      if (this.onTileReached(this.currentTileX, this.currentTileY)) {
        this.vel = ex.vec(0, 0);
        this.kill();
        return;
      }

      // Check if we've reached max range
      if (this.tilesTraveled >= this.maxRange) {
        this.kill();
        return;
      }

      // Check map bounds (64×64 tile grid)
      if (
        this.currentTileX < 0 ||
        this.currentTileX >= 64 ||
        this.currentTileY < 0 ||
        this.currentTileY >= 64
      ) {
        this.kill();
        return;
      }

      // Advance to next tile
      this.nextTileX = this.currentTileX + dx;
      this.nextTileY = this.currentTileY + dy;
    }
  }
}
