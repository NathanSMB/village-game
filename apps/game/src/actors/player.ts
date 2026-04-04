import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import { type InventoryState, defaultInventory } from "../types/inventory.ts";
import { type VitalsState, clampVital, defaultVitals, updateVitals } from "../types/vitals.ts";
import { EquipmentSlot } from "../types/item.ts";
import { isActionHeld, wasActionPressed } from "../systems/keybinds.ts";
import { compositeCharacter } from "../systems/character-compositor.ts";
import { getWeaponSpriteSheet } from "../systems/sprite-loader.ts";

const TILE_SIZE = 32;
const MOVE_SPEED = 160;
const MAP_TILES = 64;
const PICK_DURATION_MS = 500;
const DRINK_DURATION_MS = 1000; // 4 frames × 250ms each
const DRINK_THIRST_RESTORE = 25;
const PICKUP_DURATION_MS = 800; // 4 frames × 200ms each
const ATTACK_DURATION_MS = 400; // 3 frames × ~133ms each
const TURN_DELAY_MS = 120; // hold a direction key this long before walking

export type Direction = "down" | "up" | "left" | "right";

const DIRECTION_ACTIONS: readonly {
  dir: Direction;
  action: "moveUp" | "moveDown" | "moveLeft" | "moveRight";
}[] = [
  { dir: "up", action: "moveUp" },
  { dir: "down", action: "moveDown" },
  { dir: "left", action: "moveLeft" },
  { dir: "right", action: "moveRight" },
];

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

// Swing attack frame offsets: frames 52-63 (4 dirs × 3 swing poses)
const SWING_DIR_OFFSET: Record<Direction, number> = {
  down: 52,
  up: 55,
  left: 58,
  right: 61,
};

// Thrust attack frame offsets: frames 64-75 (4 dirs × 3 thrust poses)
const THRUST_DIR_OFFSET: Record<Direction, number> = {
  down: 64,
  up: 67,
  left: 70,
  right: 73,
};

export type AttackStyle = "swing" | "thrust";

// Items that use thrust animation (spear). Everything else uses swing.
const THRUST_ITEM_IDS = new Set(["spear"]);

function tileCenter(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

function posToTile(px: number): number {
  return Math.floor(px / TILE_SIZE);
}

export type BlockedCheck = (
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
) => boolean;

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
  private isBlocked: BlockedCheck = () => false; // eslint-disable-line @typescript-eslint/no-unused-vars
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

  // Attack state
  private attacking = false;
  private attackStyle: AttackStyle | null = null;
  private attackTimer = 0;

  // Direction input state: tracks pressed direction keys ordered by most-recent first.
  // The first entry that is still held is the active direction.
  private directionStack: Direction[] = [];
  private turnTimer = 0;

  // Weapon overlay: separate child actor with 64×64 sprites that can extend
  // beyond the character's 32×32 tile (prevents clipping during attacks).
  private weaponActor: ex.Actor;
  private weaponSheet: ex.SpriteSheet | null = null;

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

    // Create weapon child actor — positioned at same center as player,
    // renders 64×64 sprite (16px overflow in each direction)
    this.weaponActor = new ex.Actor({
      anchor: ex.vec(0.5, 0.5),
      z: 11,
    });
    this.addChild(this.weaponActor);
    this.setupWeaponOverlay();

    this.showFrame(DIR_OFFSET[this.facing]);
    this.tileX = posToTile(startPos.x);
    this.tileY = posToTile(startPos.y);
    this.targetX = this.tileX;
    this.targetY = this.tileY;
  }

  /** Load the weapon sprite sheet for the currently equipped MainHand item. */
  private setupWeaponOverlay(): void {
    const mainHand = this.inventory.equipment[EquipmentSlot.MainHand];
    this.weaponSheet = mainHand ? getWeaponSpriteSheet(mainHand.id) : null;
    if (!this.weaponSheet) {
      this.weaponActor.graphics.visible = false;
    }
  }

  /**
   * Display a specific animation frame on both the character and weapon overlay.
   * The weapon sprite is 64×64 (centered on the same point as the 32×32 character)
   * so tools can visually extend into adjacent tiles during attack animations.
   */
  private showFrame(frameIdx: number): void {
    const sprite = this.spriteSheet.getSprite(frameIdx, 0);
    if (sprite) this.graphics.use(sprite);

    if (this.weaponSheet) {
      const weaponSprite = this.weaponSheet.getSprite(frameIdx, 0);
      if (weaponSprite) {
        this.weaponActor.graphics.use(weaponSprite);
        this.weaponActor.graphics.visible = true;
      } else {
        this.weaponActor.graphics.visible = false;
      }
    }
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
    this.showFrame(PICK_DIR_OFFSET[this.facing]);
  }

  isPicking(): boolean {
    return this.picking;
  }

  /** Start the drinking animation. Locks the player for DRINK_DURATION_MS. */
  startDrinking(): void {
    this.stopMovement();
    this.drinking = true;
    this.drinkTimer = DRINK_DURATION_MS;
    this.showFrame(DRINK_DIR_OFFSET[this.facing]);
  }

  isDrinking(): boolean {
    return this.drinking;
  }

  /** Start the pickup-item animation. Locks the player for PICKUP_DURATION_MS. */
  startPickingUpItem(): void {
    this.stopMovement();
    this.pickingUpItem = true;
    this.pickupTimer = PICKUP_DURATION_MS;
    this.showFrame(PICKUP_DIR_OFFSET[this.facing]);
  }

  isPickingUpItem(): boolean {
    return this.pickingUpItem;
  }

  /**
   * Start an attack animation. Auto-detects swing vs thrust from equipped MainHand weapon.
   * When no weapon is equipped, performs an unarmed swing attack.
   */
  startAttack(): AttackStyle {
    const mainHand = this.inventory.equipment[EquipmentSlot.MainHand];
    const style: AttackStyle = mainHand && THRUST_ITEM_IDS.has(mainHand.id) ? "thrust" : "swing";
    this.stopMovement();
    this.attacking = true;
    this.attackStyle = style;
    this.attackTimer = ATTACK_DURATION_MS;

    const offsets = style === "swing" ? SWING_DIR_OFFSET : THRUST_DIR_OFFSET;
    this.showFrame(offsets[this.facing]);

    return style;
  }

  isAttacking(): boolean {
    return this.attacking;
  }

  getAttackStyle(): AttackStyle | null {
    return this.attackStyle;
  }

  /** Returns true if the player is locked in any animation. */
  isBusy(): boolean {
    return this.picking || this.drinking || this.pickingUpItem || this.attacking;
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

      const pickBase = PICK_DIR_OFFSET[this.facing];
      const frameIdx = this.pickTimer > halfDuration ? pickBase : pickBase + 1;
      this.showFrame(frameIdx);

      if (this.pickTimer <= 0) {
        this.picking = false;
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    // Drinking animation locks movement
    if (this.drinking) {
      this.drinkTimer -= delta;
      const quarterDuration = DRINK_DURATION_MS / 4;

      const drinkBase = DRINK_DIR_OFFSET[this.facing];
      let poseIdx: number;
      if (this.drinkTimer > quarterDuration * 3) {
        poseIdx = 0;
      } else if (this.drinkTimer > quarterDuration * 2) {
        poseIdx = 1;
      } else if (this.drinkTimer > quarterDuration) {
        poseIdx = 2;
      } else {
        poseIdx = 3;
      }

      this.showFrame(drinkBase + poseIdx);

      if (this.drinkTimer <= 0) {
        this.drinking = false;
        this.vitals = {
          ...this.vitals,
          thirst: clampVital(this.vitals.thirst + DRINK_THIRST_RESTORE),
        };
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    // Pickup-item animation locks movement
    if (this.pickingUpItem) {
      this.pickupTimer -= delta;
      const quarterDuration = PICKUP_DURATION_MS / 4;

      const pickupBase = PICKUP_DIR_OFFSET[this.facing];
      let poseIdx: number;
      if (this.pickupTimer > quarterDuration * 3) {
        poseIdx = 0;
      } else if (this.pickupTimer > quarterDuration * 2) {
        poseIdx = 1;
      } else if (this.pickupTimer > quarterDuration) {
        poseIdx = 2;
      } else {
        poseIdx = 3;
      }

      this.showFrame(pickupBase + poseIdx);

      if (this.pickupTimer <= 0) {
        this.pickingUpItem = false;
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    // Attack animation locks movement
    if (this.attacking && this.attackStyle) {
      this.attackTimer -= delta;
      const thirdDuration = ATTACK_DURATION_MS / 3;

      const offsets = this.attackStyle === "swing" ? SWING_DIR_OFFSET : THRUST_DIR_OFFSET;
      const base = offsets[this.facing];
      let poseIdx: number;
      if (this.attackTimer > thirdDuration * 2) {
        poseIdx = 0;
      } else if (this.attackTimer > thirdDuration) {
        poseIdx = 1;
      } else {
        poseIdx = 2;
      }

      this.showFrame(base + poseIdx);

      if (this.attackTimer <= 0) {
        this.attacking = false;
        this.attackStyle = null;
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    // Always track direction key presses/releases, even while moving,
    // so the stack is accurate when the current tile-step finishes.
    const kb = engine.input.keyboard;

    if (!this.inputLocked) {
      // Push newly pressed directions to the front of the stack
      for (const { dir, action } of DIRECTION_ACTIONS) {
        if (wasActionPressed(kb, action)) {
          this.directionStack = this.directionStack.filter((d) => d !== dir);
          this.directionStack.unshift(dir);
        }
      }

      // Prune released directions
      this.directionStack = this.directionStack.filter((dir) => {
        const entry = DIRECTION_ACTIONS.find((d) => d.dir === dir)!;
        return isActionHeld(kb, entry.action);
      });
    }

    // Track whether we just finished a tile-step this frame so we can
    // skip the turn delay and chain movements seamlessly.
    let justArrived = false;

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
        justArrived = true;
      } else {
        return;
      }
    }

    // Skip all input when locked (e.g. item picker overlay is open)
    if (this.inputLocked) return;

    // Determine the active direction (most recently pressed key still held)
    const activeDir = this.directionStack[0] ?? null;

    if (!activeDir) {
      this.turnTimer = 0;
      return;
    }

    // Face the active direction immediately
    if (activeDir !== this.facing) {
      this.facing = activeDir;
      this.showFrame(DIR_OFFSET[this.facing]);
      // Apply the turn delay only from idle — skip it when chaining tile-steps
      // so direction changes mid-walk feel responsive.
      if (!justArrived) {
        this.turnTimer = TURN_DELAY_MS;
      }
    }

    // Count down the turn delay — don't walk until it expires
    if (this.turnTimer > 0) {
      this.turnTimer -= delta;
      return;
    }

    // Start movement in the active direction
    const dx = DIR_DX[activeDir];
    const dy = DIR_DY[activeDir];
    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    if (nextX < 0 || nextX >= MAP_TILES || nextY < 0 || nextY >= MAP_TILES) return;
    if (this.isBlocked(this.tileX, this.tileY, nextX, nextY)) return;

    this.targetX = nextX;
    this.targetY = nextY;
    this.moving = true;

    const walkFrameIdx = DIR_OFFSET[this.facing] + 1 + this.walkFrame;
    this.showFrame(walkFrameIdx);

    const goalX = tileCenter(this.targetX);
    const goalY = tileCenter(this.targetY);
    const vx = goalX - this.pos.x;
    const vy = goalY - this.pos.y;
    const len = Math.sqrt(vx * vx + vy * vy);
    this.vel = ex.vec((vx / len) * MOVE_SPEED, (vy / len) * MOVE_SPEED);
  }

  refreshSprite(): void {
    this.spriteSheet = compositeCharacter(this.appearance, this.inventory.equipment);
    this.setupWeaponOverlay();
    this.showFrame(DIR_OFFSET[this.facing]);
  }

  getTileX(): number {
    return this.tileX;
  }

  getTileY(): number {
    return this.tileY;
  }
}
