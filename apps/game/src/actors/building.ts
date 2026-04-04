import * as ex from "excalibur";
import type { BuildingType } from "../data/buildings.ts";
import { flattenIngredients, totalMaterials } from "../data/buildings.ts";
import type { InventoryState } from "../types/inventory.ts";
import { buildingGraphic } from "../systems/building-sprites.ts";
import { DamageFlash } from "./damage-flash.ts";
import type { BuildingSaveState } from "../systems/save-manager.ts";

const TILE_SIZE = 32;
const SHAKE_DURATION = 200;
const SHAKE_MAGNITUDE = 2;

/**
 * Represents a placed building in the world.
 * Can be in "hologram" state (under construction) or "complete".
 */
export class Building extends ex.Actor {
  readonly type: BuildingType;
  state: "hologram" | "complete";
  materialsDelivered: number;
  hp: number;
  isOpen: boolean;
  /** 0-3 clockwise quarter-turns (0 = default orientation). */
  tileRotation: number;
  readonly tileX: number;
  readonly tileY: number;

  private damageFlash: DamageFlash;
  private shakeTimer = 0;
  private baseX: number;

  // Hologram pulse animation
  private holoPhase = 0;

  /** Callback set by GameWorld to handle destruction cleanup. */
  onDestroy: (() => void) | null = null;

  constructor(
    type: BuildingType,
    tileX: number,
    tileY: number,
    state: "hologram" | "complete" = "hologram",
    tileRotation = 0,
  ) {
    const worldX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const worldY = tileY * TILE_SIZE + TILE_SIZE / 2;
    super({
      pos: ex.vec(worldX, worldY),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 5,
    });
    this.type = type;
    this.state = state;
    this.materialsDelivered = state === "complete" ? totalMaterials(type) : 0;
    this.hp = state === "complete" ? type.maxHp : 0;
    this.isOpen = false;
    this.tileRotation = tileRotation;
    this.tileX = tileX;
    this.tileY = tileY;
    this.baseX = worldX;

    this.damageFlash = new DamageFlash(this, TILE_SIZE);
    this.updateGraphic();
  }

  /** Update the displayed graphic based on current state. */
  updateGraphic(): void {
    if (this.state === "hologram") {
      this.graphics.use(buildingGraphic(this.type.id, "hologram", this.isOpen, this.tileRotation));
    } else {
      this.graphics.use(buildingGraphic(this.type.id, "solid", this.isOpen, this.tileRotation));
    }
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.damageFlash.update(delta);

    // Shake effect
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.pos.x = this.baseX;
      } else {
        this.pos.x = this.baseX + Math.sin(this.shakeTimer * 0.05) * SHAKE_MAGNITUDE;
      }
    }

    // Hologram pulsing alpha
    if (this.state === "hologram") {
      this.holoPhase += delta * 0.003;
      this.graphics.opacity = 0.35 + Math.sin(this.holoPhase) * 0.1;
    } else {
      this.graphics.opacity = 1;
    }
  }

  /**
   * Attempt to deliver one material from the player's inventory.
   * Returns the item ID that was consumed, or null if the required item is missing.
   */
  deliverMaterial(inventory: InventoryState): string | null {
    if (this.state !== "hologram") return null;

    const flat = flattenIngredients(this.type);
    if (this.materialsDelivered >= flat.length) return null;

    const neededId = flat[this.materialsDelivered];
    // Find the item in the player's bag
    const bagIdx = inventory.bag.findIndex((item) => item.id === neededId);
    if (bagIdx === -1) return null;

    // Consume the item
    inventory.bag.splice(bagIdx, 1);
    this.materialsDelivered++;

    // Check if construction is complete
    if (this.materialsDelivered >= flat.length) {
      this.completeConstruction();
    } else {
      // Update graphic to show progress (stays hologram but could show partial)
      this.updateGraphic();
    }

    return neededId;
  }

  /** Get the ID of the next required material, or null if done. */
  getNextRequired(): string | null {
    const flat = flattenIngredients(this.type);
    if (this.materialsDelivered >= flat.length) return null;
    return flat[this.materialsDelivered];
  }

  /** Transition from hologram to completed building. */
  private completeConstruction(): void {
    this.state = "complete";
    this.hp = this.type.maxHp;
    this.isOpen = false;
    this.updateGraphic();
  }

  /** Whether this building should currently block movement. */
  isSolid(): boolean {
    if (this.state === "hologram") return false;
    if (this.type.interactable) {
      return this.type.solidWhenClosed && !this.isOpen;
    }
    return this.type.solid;
  }

  /** Apply damage to a completed building. Returns true if destroyed. */
  takeBuildingDamage(amount: number): boolean {
    if (this.state !== "complete" || amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.damageFlash.trigger();
    this.shakeTimer = SHAKE_DURATION;

    if (this.hp <= 0) {
      this.onDestroy?.();
      this.kill();
      return true;
    }
    return false;
  }

  /** Repair the building. Returns actual amount repaired. */
  repair(amount: number): number {
    if (this.state !== "complete" || amount <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.type.maxHp, this.hp + amount);
    return this.hp - before;
  }

  /** Toggle open/close for interactable buildings (doors, gates). */
  toggle(): void {
    if (!this.type.interactable || this.state !== "complete") return;
    this.isOpen = !this.isOpen;
    this.updateGraphic();
  }

  /** Serialize for save. */
  getState(): BuildingSaveState {
    return {
      typeId: this.type.id,
      tileX: this.tileX,
      tileY: this.tileY,
      state: this.state,
      materialsDelivered: this.materialsDelivered,
      hp: this.hp,
      isOpen: this.isOpen,
      rotation: this.tileRotation,
    };
  }

  /** Restore from save. */
  restoreState(saved: BuildingSaveState): void {
    this.state = saved.state;
    this.materialsDelivered = saved.materialsDelivered;
    this.hp = saved.hp;
    this.isOpen = saved.isOpen;
    this.tileRotation = saved.rotation ?? 0;
    this.updateGraphic();
  }
}
