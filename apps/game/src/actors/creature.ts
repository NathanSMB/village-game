/**
 * Base class for all game creatures (sheep, future wolves, boars, etc.).
 *
 * Provides tile-based movement, health, damage/drops, and rendering.
 * Subclasses implement AI behavior by overriding getDrops() and driving
 * movement via moveToTile().
 */
import * as ex from "excalibur";
import type { Item } from "../types/item.ts";
import type { Direction } from "./player.ts";
import { DamageFlash } from "./damage-flash.ts";

const TILE_SIZE = 32;
const MAP_TILES = 64;
const SHAKE_DURATION = 200;
const SHAKE_MAGNITUDE = 2;

export type CreatureBehavior = "passive" | "defensive" | "hostile";

type BlockedCheck = (fromX: number, fromY: number, toX: number, toY: number) => boolean;

function tileCenter(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

const DIR_DX: Record<Direction, number> = { left: -1, right: 1, up: 0, down: 0 };
const DIR_DY: Record<Direction, number> = { up: -1, down: 1, left: 0, right: 0 };

/**
 * Sprite frame layout for creatures (4 directions × 3 frames each = 12 total):
 *   down: 0, 1, 2   (idle, walk1, walk2)
 *   up:   3, 4, 5
 *   left: 6, 7, 8
 *   right: 9, 10, 11
 */
const DIR_OFFSET: Record<Direction, number> = {
  down: 0,
  up: 3,
  left: 6,
  right: 9,
};

export abstract class Creature extends ex.Actor {
  readonly behavior: CreatureBehavior;
  readonly category: string;

  tileX: number;
  tileY: number;
  protected targetX: number;
  protected targetY: number;
  protected moving = false;
  facing: Direction = "down";
  protected walkFrame: 0 | 1 = 0;

  hp: number;
  readonly maxHp: number;
  isDead = false;

  protected speed: number;
  protected isBlocked: BlockedCheck = () => false;

  protected spriteSheet: ex.SpriteSheet | null = null;
  private damageFlash: DamageFlash;
  private shakeTimer = 0;

  constructor(
    tileX: number,
    tileY: number,
    options: {
      behavior: CreatureBehavior;
      category: string;
      hp: number;
      speed: number;
      z?: number;
    },
  ) {
    super({
      pos: ex.vec(tileCenter(tileX), tileCenter(tileY)),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: options.z ?? 9,
    });
    this.behavior = options.behavior;
    this.category = options.category;
    this.hp = options.hp;
    this.maxHp = options.hp;
    this.speed = options.speed;
    this.tileX = tileX;
    this.tileY = tileY;
    this.targetX = tileX;
    this.targetY = tileY;

    this.damageFlash = new DamageFlash(this);
  }

  setBlockedCheck(fn: BlockedCheck): void {
    this.isBlocked = fn;
  }

  setSpriteSheet(sheet: ex.SpriteSheet): void {
    this.spriteSheet = sheet;
    this.showFrame(DIR_OFFSET[this.facing]);
  }

  protected showFrame(frameIdx: number): void {
    if (!this.spriteSheet) return;
    const sprite = this.spriteSheet.getSprite(frameIdx, 0);
    if (sprite) this.graphics.use(sprite);
  }

  isMoving(): boolean {
    return this.moving;
  }

  /**
   * Attempt to move one tile in the given direction.
   * Returns true if movement started, false if blocked.
   */
  moveToTile(dir: Direction): boolean {
    if (this.moving || this.isDead) return false;

    const dx = DIR_DX[dir];
    const dy = DIR_DY[dir];
    const nx = this.tileX + dx;
    const ny = this.tileY + dy;

    if (nx < 0 || nx >= MAP_TILES || ny < 0 || ny >= MAP_TILES) return false;
    if (this.isBlocked(this.tileX, this.tileY, nx, ny)) return false;

    this.facing = dir;
    this.targetX = nx;
    this.targetY = ny;
    this.moving = true;

    // Show walk frame
    const walkFrameIdx = DIR_OFFSET[this.facing] + 1 + this.walkFrame;
    this.showFrame(walkFrameIdx);

    // Set velocity toward target
    const goalX = tileCenter(this.targetX);
    const goalY = tileCenter(this.targetY);
    const vx = goalX - this.pos.x;
    const vy = goalY - this.pos.y;
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len > 0) {
      this.vel = ex.vec((vx / len) * this.speed, (vy / len) * this.speed);
    }

    return true;
  }

  /**
   * Move toward a specific tile using a direction. Convenience for AI.
   */
  moveTowardTile(targetX: number, targetY: number): boolean {
    if (this.tileX === targetX && this.tileY === targetY) return false;

    const dx = targetX - this.tileX;
    const dy = targetY - this.tileY;

    // Prefer the axis with greater distance
    let dir: Direction;
    if (Math.abs(dx) >= Math.abs(dy)) {
      dir = dx > 0 ? "right" : "left";
    } else {
      dir = dy > 0 ? "down" : "up";
    }

    return this.moveToTile(dir);
  }

  /**
   * Take damage, trigger visual effects. Returns item drops if killed.
   */
  takeDamage(amount: number): Item[] {
    if (this.isDead) return [];

    this.hp -= amount;
    this.damageFlash.trigger();
    this.startShake();

    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      return this.getDrops();
    }

    return [];
  }

  /** Subclasses override to define what items drop on death. */
  protected abstract getDrops(): Item[];

  private startShake(): void {
    this.shakeTimer = SHAKE_DURATION;
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.damageFlash.update(delta);

    // Movement interpolation (runs before shake so pos is authoritative)
    if (this.moving) {
      const goalX = tileCenter(this.targetX);
      const goalY = tileCenter(this.targetY);
      const dx = goalX - this.pos.x;
      const dy = goalY - this.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        this.pos.x = goalX;
        this.pos.y = goalY;
        this.tileX = this.targetX;
        this.tileY = this.targetY;
        this.vel = ex.vec(0, 0);
        this.moving = false;
        this.walkFrame = this.walkFrame === 0 ? 1 : 0;
        this.showFrame(DIR_OFFSET[this.facing]);
      }
    }

    // Shake effect — applied as graphics offset so it doesn't corrupt pos
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.graphics.offset = ex.vec(0, 0);
      } else {
        const offset = (Math.random() - 0.5) * 2 * SHAKE_MAGNITUDE;
        this.graphics.offset = ex.vec(offset, 0);
      }
    }
  }

  getTileX(): number {
    return this.tileX;
  }

  getTileY(): number {
    return this.tileY;
  }

  /**
   * Returns the tile key that this creature will occupy once it finishes moving.
   * If not moving, returns current tile.
   */
  getTargetTileX(): number {
    return this.moving ? this.targetX : this.tileX;
  }

  getTargetTileY(): number {
    return this.moving ? this.targetY : this.tileY;
  }
}
