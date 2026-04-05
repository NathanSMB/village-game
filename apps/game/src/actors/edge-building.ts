import * as ex from "excalibur";
import type { BuildingType } from "../data/buildings.ts";
import { flattenIngredients, totalMaterials } from "../data/buildings.ts";
import type { InventoryState } from "../types/inventory.ts";
import { edgeBuildingGraphic, WALL_THICKNESS } from "../systems/building-sprites.ts";
import {
  type EdgeAxis,
  type FenceConnections,
  DEFAULT_CONNECTIONS,
  edgeToWorldPos,
  decodeEdgeKey,
} from "../systems/edge-key.ts";
import { DamageFlash } from "./damage-flash.ts";
import { HealthBar } from "./health-bar.ts";
import type { EdgeBuildingSaveState } from "../systems/save-manager.ts";

const TILE_SIZE = 32;
const SHAKE_DURATION = 200;
const SHAKE_MAGNITUDE = 2;

/**
 * Represents an edge-based building (wall, fence, door, gate) placed on
 * the boundary between two tiles.
 */
export class EdgeBuilding extends ex.Actor {
  readonly type: BuildingType;
  readonly edgeKey: number;
  readonly axis: EdgeAxis;
  readonly edgeX: number;
  readonly edgeY: number;
  state: "hologram" | "complete";
  materialsDelivered: number;
  hp: number;
  isOpen: boolean;
  private connections: FenceConnections;

  private damageFlash: DamageFlash;
  private healthBar: HealthBar;
  private shakeTimer = 0;
  private baseX: number;
  private baseY: number;

  // Hologram pulse animation
  private holoPhase = 0;

  /** Callback set by GameWorld to handle destruction cleanup. */
  onDestroy: (() => void) | null = null;

  constructor(type: BuildingType, edgeKey: number, state: "hologram" | "complete" = "hologram") {
    const decoded = decodeEdgeKey(edgeKey);
    const { wx, wy } = edgeToWorldPos(decoded.x, decoded.y, decoded.axis);
    const isH = decoded.axis === "h";
    super({
      pos: ex.vec(wx, wy),
      width: isH ? TILE_SIZE : WALL_THICKNESS,
      height: isH ? WALL_THICKNESS : TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 6,
    });
    this.type = type;
    this.edgeKey = edgeKey;
    this.axis = decoded.axis;
    this.edgeX = decoded.x;
    this.edgeY = decoded.y;
    this.state = state;
    this.materialsDelivered = state === "complete" ? totalMaterials(type) : 0;
    this.hp = state === "complete" ? type.maxHp : 0;
    this.isOpen = false;
    this.connections = { ...DEFAULT_CONNECTIONS };
    this.baseX = wx;
    this.baseY = wy;

    const flashSize = isH ? TILE_SIZE : WALL_THICKNESS;
    this.damageFlash = new DamageFlash(this, flashSize);
    this.healthBar = new HealthBar({
      barWidth: 20,
      offsetY: isH ? -7 : -19,
      getHealth: () => ({ current: this.hp, max: this.type.maxHp }),
      shouldShow: () => this.state === "complete" && this.hp < this.type.maxHp,
    });
    this.addChild(this.healthBar);
    this.updateGraphic();
  }

  /** Update the displayed graphic based on current state. */
  updateGraphic(connections?: FenceConnections): void {
    if (connections) this.connections = connections;
    const mode = this.state === "hologram" ? "hologram" : "solid";
    this.graphics.use(
      edgeBuildingGraphic(this.type.id, mode, this.axis, this.isOpen, this.connections),
    );
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.damageFlash.update(delta);

    // Shake effect
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.pos.x = this.baseX;
        this.pos.y = this.baseY;
      } else {
        const offset = Math.sin(this.shakeTimer * 0.05) * SHAKE_MAGNITUDE;
        if (this.axis === "h") {
          this.pos.x = this.baseX + offset;
        } else {
          this.pos.y = this.baseY + offset;
        }
      }
    }

    // Hologram pulsing alpha (skip when damage flash is controlling opacity)
    if (this.state === "hologram") {
      this.holoPhase += delta * 0.003;
      this.graphics.opacity = 0.35 + Math.sin(this.holoPhase) * 0.1;
    } else if (!this.damageFlash.isActive()) {
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
    const bagIdx = inventory.bag.findIndex((item) => item.id === neededId);
    if (bagIdx === -1) return null;

    inventory.bag.splice(bagIdx, 1);
    this.materialsDelivered++;

    if (this.materialsDelivered >= flat.length) {
      this.completeConstruction();
    } else {
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

  /** Whether this building should currently block passage across the edge. */
  isSolid(): boolean {
    if (this.state === "hologram") return false;
    if (this.type.interactable) {
      return this.type.solidWhenClosed && !this.isOpen;
    }
    return this.type.solid;
  }

  /** Whether this is a fence-type building (for autotile connections). */
  isFenceType(): boolean {
    return this.type.id === "fence" || this.type.id === "fence_gate";
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
  getState(): EdgeBuildingSaveState {
    return {
      typeId: this.type.id,
      edgeKey: this.edgeKey,
      axis: this.axis,
      x: this.edgeX,
      y: this.edgeY,
      state: this.state,
      materialsDelivered: this.materialsDelivered,
      hp: this.hp,
      isOpen: this.isOpen,
    };
  }

  /** Restore from save. */
  restoreState(saved: EdgeBuildingSaveState): void {
    this.state = saved.state;
    this.materialsDelivered = saved.materialsDelivered;
    this.hp = saved.hp;
    this.isOpen = saved.isOpen;
    this.updateGraphic();
  }
}
