import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import { type InventoryState, defaultInventory } from "../types/inventory.ts";
import { type VitalsState, clampVital, defaultVitals, updateVitals } from "../types/vitals.ts";
import { isActionHeld } from "../systems/keybinds.ts";
import { compositeCharacter } from "../systems/character-compositor.ts";

const TILE_SIZE = 32;
const MOVE_SPEED = 160;
const MAP_TILES = 64;
const PICK_DURATION_MS = 500;
const DRINK_DURATION_MS = 1000; // 4 frames × 250ms each
const DRINK_THIRST_RESTORE = 25;
const PICKUP_DURATION_MS = 800; // 4 frames × 200ms each

export type Direction = "down" | "up" | "left" | "right";

const DIR_OFFSET: Record<Direction, number> = {
  down: 0,
  up: 3,
  left: 6,
  right: 9,
};

const DIR_DX: Record<Direction, number> = { left: -1, right: 1, up: 0, down: 0 };
const DIR_DY: Record<Direction, number> = { up: -1, down: 1, left: 0, right: 0 };

// Pick animation frame offsets: frames 12-19 (4 dirs × 2 pick poses)
const PICK_DIR_OFFSET: Record<Direction, number> = {
  down: 12,
  up: 14,
  left: 16,
  right: 18,
};

// Drink animation frame offsets: frames 20-35 (4 dirs × 4 drink poses)
const DRINK_DIR_OFFSET: Record<Direction, number> = {
  down: 20,
  up: 24,
  left: 28,
  right: 32,
};

// Pickup-item animation frame offsets: frames 36-51 (4 dirs × 4 pickup poses)
const PICKUP_DIR_OFFSET: Record<Direction, number> = {
  down: 36,
  up: 40,
  left: 44,
  right: 48,
};

function tileCenter(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

function posToTile(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

export type BlockedCheck = (tileX: number, tileY: number) => boolean;

export class Player extends ex.Actor {
  readonly appearance: CharacterAppearance;
  readonly inventory: InventoryState;
  vitals: VitalsState;
  private spriteSheet: ex.SpriteSheet;
  private tileX: number;
  private tileY: number;
  private targetX: number;
  private targetY: number;
  private moving = false;
  private facing: Direction = "down";
  private walkFrame: 0 | 1 = 0;
  private isBlocked: BlockedCheck = () => false;
  private inputLocked = false;

  // Picking state
  private picking = false;
  private pickTimer = 0;

  // Drinking state
  private drinking = false;
  private drinkTimer = 0;

  // Pickup-item state
  private pickingUpItem = false;
  private pickupTimer = 0;

  constructor(
    appearance: CharacterAppearance,
    startPos: ex.Vector,
    inventory?: InventoryState,
    vitals?: VitalsState,
  ) {
    super({
      pos: startPos,
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 10,
    });
    this.appearance = appearance;
    this.inventory = inventory ?? defaultInventory(appearance);
    this.vitals = vitals ?? defaultVitals();
    this.spriteSheet = compositeCharacter(appearance, this.inventory.equipment);
    this.updateGraphic();
    this.tileX = posToTile(startPos.x);
    this.tileY = posToTile(startPos.y);
    this.targetX = this.tileX;
    this.targetY = this.tileY;
  }

  setBlockedCheck(fn: BlockedCheck): void {
    this.isBlocked = fn;
  }

  /** Lock all player input (movement + actions). Used by UI overlays. */
  lockInput(): void {
    this.inputLocked = true;
  }

  /** Unlock player input. */
  unlockInput(): void {
    this.inputLocked = false;
  }

  /** Stop any in-progress movement, snapping to the nearest tile. */
  private stopMovement(): void {
    if (!this.moving) return;
    this.moving = false;
    this.vel = ex.vec(0, 0);
    // Snap back to the tile we started from
    this.targetX = this.tileX;
    this.targetY = this.tileY;
    this.pos.x = tileCenter(this.tileX);
    this.pos.y = tileCenter(this.tileY);
  }

  isMoving(): boolean {
    return this.moving;
  }

  /** Start the picking animation. Locks the player for PICK_DURATION_MS. */
  startPicking(): void {
    this.stopMovement();
    this.picking = true;
    this.pickTimer = PICK_DURATION_MS;
    // Show the reach frame immediately
    const reachIdx = PICK_DIR_OFFSET[this.facing];
    const sprite = this.spriteSheet.getSprite(reachIdx, 0);
    if (sprite) this.graphics.use(sprite);
  }

  isPicking(): boolean {
    return this.picking;
  }

  /** Start the drinking animation. Locks the player for DRINK_DURATION_MS. */
  startDrinking(): void {
    this.stopMovement();
    this.drinking = true;
    this.drinkTimer = DRINK_DURATION_MS;
    // Show the first drink frame immediately (begin kneel)
    const drinkIdx = DRINK_DIR_OFFSET[this.facing];
    const sprite = this.spriteSheet.getSprite(drinkIdx, 0);
    if (sprite) this.graphics.use(sprite);
  }

  isDrinking(): boolean {
    return this.drinking;
  }

  /** Start the pickup-item animation. Locks the player for PICKUP_DURATION_MS. */
  startPickingUpItem(): void {
    this.stopMovement();
    this.pickingUpItem = true;
    this.pickupTimer = PICKUP_DURATION_MS;
    // Show the first pickup frame immediately (begin bend)
    const pickupIdx = PICKUP_DIR_OFFSET[this.facing];
    const sprite = this.spriteSheet.getSprite(pickupIdx, 0);
    if (sprite) this.graphics.use(sprite);
  }

  isPickingUpItem(): boolean {
    return this.pickingUpItem;
  }

  /** Returns true if the player is locked in any animation. */
  isBusy(): boolean {
    return this.picking || this.drinking || this.pickingUpItem;
  }

  getFacing(): Direction {
    return this.facing;
  }

  /** Returns the tile position the player is currently facing. */
  getFacingTile(): { x: number; y: number } {
    return {
      x: this.tileX + DIR_DX[this.facing],
      y: this.tileY + DIR_DY[this.facing],
    };
  }

  override onPreUpdate(engine: ex.Engine, delta: number): void {
    this.vitals = updateVitals(this.vitals, delta);

    // Picking animation locks movement
    if (this.picking) {
      this.pickTimer -= delta;
      const halfDuration = PICK_DURATION_MS / 2;

      // First half: reach frame, second half: grab frame
      const pickBase = PICK_DIR_OFFSET[this.facing];
      const frameIdx = this.pickTimer > halfDuration ? pickBase : pickBase + 1;
      const sprite = this.spriteSheet.getSprite(frameIdx, 0);
      if (sprite) this.graphics.use(sprite);

      if (this.pickTimer <= 0) {
        this.picking = false;
        this.updateGraphic();
      }
      return;
    }

    // Drinking animation locks movement
    if (this.drinking) {
      this.drinkTimer -= delta;
      const quarterDuration = DRINK_DURATION_MS / 4;

      // 4 frames: begin kneel, kneel, reach, drink
      const drinkBase = DRINK_DIR_OFFSET[this.facing];
      let poseIdx: number;
      if (this.drinkTimer > quarterDuration * 3) {
        poseIdx = 0; // begin kneel
      } else if (this.drinkTimer > quarterDuration * 2) {
        poseIdx = 1; // full kneel
      } else if (this.drinkTimer > quarterDuration) {
        poseIdx = 2; // reach toward water
      } else {
        poseIdx = 3; // drink
      }

      const frameIdx = drinkBase + poseIdx;
      const sprite = this.spriteSheet.getSprite(frameIdx, 0);
      if (sprite) this.graphics.use(sprite);

      if (this.drinkTimer <= 0) {
        this.drinking = false;
        // Restore thirst
        this.vitals = {
          ...this.vitals,
          thirst: clampVital(this.vitals.thirst + DRINK_THIRST_RESTORE),
        };
        this.updateGraphic();
      }
      return;
    }

    // Pickup-item animation locks movement
    if (this.pickingUpItem) {
      this.pickupTimer -= delta;
      const quarterDuration = PICKUP_DURATION_MS / 4;

      // 4 frames: begin bend, crouch, reach ground, grab
      const pickupBase = PICKUP_DIR_OFFSET[this.facing];
      let poseIdx: number;
      if (this.pickupTimer > quarterDuration * 3) {
        poseIdx = 0; // begin bend
      } else if (this.pickupTimer > quarterDuration * 2) {
        poseIdx = 1; // crouch
      } else if (this.pickupTimer > quarterDuration) {
        poseIdx = 2; // reach to ground
      } else {
        poseIdx = 3; // grab/rise
      }

      const frameIdx = pickupBase + poseIdx;
      const sprite = this.spriteSheet.getSprite(frameIdx, 0);
      if (sprite) this.graphics.use(sprite);

      if (this.pickupTimer <= 0) {
        this.pickingUpItem = false;
        this.updateGraphic();
      }
      return;
    }

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
        this.updateGraphic();
      }
      return;
    }

    // Skip all input when locked (e.g. item picker overlay is open)
    if (this.inputLocked) return;

    const kb = engine.input.keyboard;
    let dx = 0;
    let dy = 0;
    let newFacing: Direction | null = null;

    if (isActionHeld(kb, "moveLeft")) {
      dx = -1;
      newFacing = "left";
    } else if (isActionHeld(kb, "moveRight")) {
      dx = 1;
      newFacing = "right";
    } else if (isActionHeld(kb, "moveUp")) {
      dy = -1;
      newFacing = "up";
    } else if (isActionHeld(kb, "moveDown")) {
      dy = 1;
      newFacing = "down";
    }

    if (newFacing && newFacing !== this.facing) {
      this.facing = newFacing;
      this.updateGraphic();
    }

    if (dx === 0 && dy === 0) return;

    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    if (nextX < 0 || nextX >= MAP_TILES || nextY < 0 || nextY >= MAP_TILES) return;
    if (this.isBlocked(nextX, nextY)) return;

    this.targetX = nextX;
    this.targetY = nextY;
    this.moving = true;

    // Show walk frame while moving
    const walkFrameIdx = DIR_OFFSET[this.facing] + 1 + this.walkFrame;
    const sprite = this.spriteSheet.getSprite(walkFrameIdx, 0);
    if (sprite) this.graphics.use(sprite);

    const goalX = tileCenter(this.targetX);
    const goalY = tileCenter(this.targetY);
    const vx = goalX - this.pos.x;
    const vy = goalY - this.pos.y;
    const len = Math.sqrt(vx * vx + vy * vy);
    this.vel = ex.vec((vx / len) * MOVE_SPEED, (vy / len) * MOVE_SPEED);
  }

  refreshSprite(): void {
    this.spriteSheet = compositeCharacter(this.appearance, this.inventory.equipment);
    this.updateGraphic();
  }

  private updateGraphic(): void {
    const frameIdx = DIR_OFFSET[this.facing];
    const sprite = this.spriteSheet.getSprite(frameIdx, 0);
    if (sprite) this.graphics.use(sprite);
  }

  getTileX(): number {
    return this.tileX;
  }

  getTileY(): number {
    return this.tileY;
  }
}
