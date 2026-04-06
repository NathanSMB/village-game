/**
 * LLM-controlled NPC actor.
 *
 * Extends ex.Actor directly (NOT Player or Creature) and reuses:
 * - Character compositor for 88-frame sprite sheets
 * - Creature-style tile movement
 * - Player-style animation state machines (pick, drink, attack, etc.)
 * - Vitals system (same updateVitals pure function)
 *
 * The NPC has no keyboard input — all actions are driven by the brain (npc-brain.ts).
 */

import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import type { ChatMessage } from "../types/chat.ts";
import { type InventoryState, defaultInventory, totalWeight } from "../types/inventory.ts";
import { type VitalsState, clampVital, defaultVitals, updateVitals } from "../types/vitals.ts";
import { EquipmentSlot } from "../types/item.ts";
import type {
  NPCDefinition,
  NPCPersonality,
  NPCMemoryState,
  NPCSaveState,
  NPCActionState,
  NPCTodoItem,
  ActionLogEntry,
} from "../types/npc.ts";
import { compositeCharacter } from "../systems/character-compositor.ts";
import { getWeaponSpriteSheet } from "../systems/sprite-loader.ts";
import { createMemory, serializeMemory, deserializeMemory } from "../systems/npc-memory.ts";
import type { Direction, AttackStyle, BlockedCheck } from "./player.ts";

// ── Constants (mirrored from player.ts) ──────────────────────────────

const TILE_SIZE = 32;
const MAP_TILES = 64;
const MOVE_SPEED = 160;
const PICK_DURATION_MS = 500;
const DRINK_DURATION_MS = 1000;
const DRINK_THIRST_RESTORE = 25;
const PICKUP_DURATION_MS = 800;
const ATTACK_DURATION_MS = 400;

const OUT_OF_COMBAT_MS = 5000;
const REGEN_INTERVAL_MS = 5000;

// ── Sprite frame offsets (same 88-frame sheet as Player) ─────────────

const DIR_OFFSET: Record<Direction, number> = { down: 0, up: 3, left: 6, right: 9 };
const DIR_DX: Record<Direction, number> = { left: -1, right: 1, up: 0, down: 0 };
const DIR_DY: Record<Direction, number> = { up: -1, down: 1, left: 0, right: 0 };

const PICK_DIR_OFFSET: Record<Direction, number> = { down: 12, up: 14, left: 16, right: 18 };
const DRINK_DIR_OFFSET: Record<Direction, number> = { down: 20, up: 24, left: 28, right: 32 };
const PICKUP_DIR_OFFSET: Record<Direction, number> = { down: 36, up: 40, left: 44, right: 48 };
const SWING_DIR_OFFSET: Record<Direction, number> = { down: 52, up: 55, left: 58, right: 61 };
const THRUST_DIR_OFFSET: Record<Direction, number> = { down: 64, up: 67, left: 70, right: 73 };
const SHOOT_DIR_OFFSET: Record<Direction, number> = { down: 76, up: 79, left: 82, right: 85 };

const THRUST_ITEM_IDS = new Set(["spear"]);
const SHOOT_ITEM_IDS = new Set(["bow"]);

function tileCenter(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

// ── NPC Class ────────────────────────────────────────────────────────

export class NPC extends ex.Actor {
  // Identity
  readonly npcId: string;
  readonly npcName: string;
  readonly personality: NPCPersonality;
  readonly appearance: CharacterAppearance;

  // State (mirrors Player)
  inventory: InventoryState;
  vitals: VitalsState;
  facing: Direction = "down";
  sleeping = false;
  /** Energy recovery rate while sleeping (bed=5, bedroll=3). */
  sleepEnergyRate = 5;
  isDead = false;

  // Tile-based movement (mirrors Creature)
  tileX: number;
  tileY: number;
  private targetX: number;
  private targetY: number;
  private moving = false;
  private walkFrame: 0 | 1 = 0;
  private isBlocked: BlockedCheck = () => false;

  // Animation state machine
  actionState: NPCActionState = "idle";
  private actionTimer = 0;
  private attackStyle: AttackStyle | null = null;

  // Sprites
  private spriteSheet: ex.SpriteSheet;
  private weaponActor: ex.Actor;
  private weaponSheet: ex.SpriteSheet | null = null;

  // Memory
  memory: NPCMemoryState;

  // Goal system — the NPC's current objective, drives decision-making
  todoList: NPCTodoItem[] = [];
  /** Skip auto-check for N action cycles after a fresh plan to avoid instant re-planning. */
  todoGracePeriod = 0;

  // Claimed bed — the NPC's assigned bed for sleeping
  claimedBed: { x: number; y: number } | null = null;

  // Object permanence — discovered resource locations persist across vision range
  // Key format: "type:x,y" (e.g. "tree:30,25"), value: last known state
  knownLocations: Record<string, string> = {};

  /** Update known locations from visible entities. Called each decision cycle. */
  updateKnownLocations(entities: { type: string; x: number; y: number; details: string }[]): void {
    for (const e of entities) {
      if (e.type === "tree" || e.type === "rock" || e.type === "bush") {
        this.knownLocations[`${e.type}:${e.x},${e.y}`] = e.details;
      }
      // Water is reported as type "building" with "water" in details
      if (e.details.includes("water") && e.details.includes("drinkable")) {
        this.knownLocations[`water:${e.x},${e.y}`] = "water";
      }
      // Buildings and holograms
      if (e.type === "building" && !e.details.includes("water")) {
        this.knownLocations[`building:${e.x},${e.y}`] = e.details;
      }
    }
  }

  /**
   * Auto-check todo completion conditions against current state.
   * Marks items as done if their doneWhen condition is satisfied.
   * Called before each LLM decision to prevent redundant actions.
   */
  autoCheckTodos(): void {
    if (this.todoList.length === 0) return;

    // Grace period: skip auto-check for a few cycles after a fresh plan
    // so already-met conditions don't instantly clear the new plan
    if (this.todoGracePeriod > 0) {
      this.todoGracePeriod--;
      return;
    }

    const bagItemNames = this.inventory.bag.map((i) => i.id);
    const equippedIds = Object.values(this.inventory.equipment)
      .filter((i) => i != null)
      .map((i) => i.id);
    const allItems = [...bagItemNames, ...equippedIds];

    for (const todo of this.todoList) {
      if (todo.done) continue;
      const cond = todo.doneWhen.toLowerCase();

      // Check "have X in bag" or "X is in bag"
      const bagMatch = cond.match(/have (?:at least \d+ )?(\w+) in bag|(\w+) is in bag/);
      if (bagMatch) {
        const itemName = (bagMatch[1] ?? bagMatch[2]).toLowerCase();
        if (allItems.some((id) => id.toLowerCase().includes(itemName))) {
          todo.done = true;
          continue;
        }
      }

      // Check "X in bag or equipped"
      const bagOrEquipMatch = cond.match(/(\w+).*in bag or equipped/);
      if (bagOrEquipMatch) {
        const itemName = bagOrEquipMatch[1].toLowerCase();
        if (allItems.some((id) => id.toLowerCase().includes(itemName))) {
          todo.done = true;
          continue;
        }
      }

      // Check "X is equipped" (only equipped, not bag)
      const equipOnlyMatch = cond.match(/(\w+)\s+is equipped/);
      if (equipOnlyMatch && !cond.includes("in bag")) {
        const itemName = equipOnlyMatch[1].toLowerCase();
        if (equippedIds.some((id) => id.toLowerCase().includes(itemName))) {
          todo.done = true;
          continue;
        }
      }

      // Check vital thresholds: "thirst is above 40" / "hunger above 30"
      const vitalMatch = cond.match(/(thirst|hunger|health|energy)\s*(?:is\s*)?above\s*(\d+)/);
      if (vitalMatch) {
        const vital = vitalMatch[1] as keyof typeof this.vitals;
        const threshold = Number(vitalMatch[2]);
        if (vital in this.vitals && this.vitals[vital] > threshold) {
          todo.done = true;
          continue;
        }
      }

      // Check "have a claimed bed" / "bed is claimed"
      if (
        cond.includes("claimed bed") ||
        cond.includes("bed is claimed") ||
        cond.includes("have a bed")
      ) {
        if (this.claimedBed) {
          todo.done = true;
          continue;
        }
      }
    }

    // If all done, clear the list so the NPC will plan again
    if (this.todoList.length > 0 && this.todoList.every((t) => t.done)) {
      this.todoList = [];
    }
  }

  // Chat inbox — NEW messages heard since last LLM call, consumed by brain
  chatInbox: ChatMessage[] = [];

  // Thinking history — last 5 exchanges with the reasoning model
  thinkingHistory: { question: string; answer: string }[] = [];
  private static readonly MAX_THINKING_HISTORY = 5;

  /** Add a thinking exchange to history (keeps newest 5). */
  pushThinkingHistory(question: string, answer: string): void {
    this.thinkingHistory.push({ question, answer });
    if (this.thinkingHistory.length > NPC.MAX_THINKING_HISTORY) {
      this.thinkingHistory.splice(0, this.thinkingHistory.length - NPC.MAX_THINKING_HISTORY);
    }
  }

  // Action log — rolling log of actions + results sent to LLM for context
  actionLog: ActionLogEntry[] = [];
  private static readonly MAX_ACTION_LOG = 30;

  /** Add an action log entry (keeps newest 30, FIFO). */
  pushActionLog(tick: number, action: string, result: string, changes?: string): void {
    this.actionLog.push({ tick, action, result, changes });
    if (this.actionLog.length > NPC.MAX_ACTION_LOG) {
      this.actionLog.splice(0, this.actionLog.length - NPC.MAX_ACTION_LOG);
    }
  }

  // Chat history — rolling log of recent messages (sent + received), kept across LLM calls
  chatHistory: ChatMessage[] = [];
  /** Timestamp of the last chat message this NPC sent (for cooldown). */
  lastChatTime = 0;
  private static readonly MAX_CHAT_HISTORY = 50;

  // Brain coordination
  private waitTimer = 0;
  pendingPath: Direction[] = []; // for move_to multi-step
  /** Action to execute after pendingPath completes (auto-walk-then-do pattern). */
  pendingAction: import("../types/npc.ts").NPCAction | null = null;

  /** Which emergency types have already triggered a replan (to avoid re-triggering every tick). */
  emergencyReplanned = new Set<string>();

  // Stuck detection — consecutive failures of the same action trigger replan
  private lastFailedAction = "";
  private consecutiveFailures = 0;

  /** Track action failure. Returns true if stuck (3+ consecutive same failures). */
  trackFailure(actionJson: string): boolean {
    if (actionJson === this.lastFailedAction) {
      this.consecutiveFailures++;
    } else {
      this.lastFailedAction = actionJson;
      this.consecutiveFailures = 1;
    }
    return this.consecutiveFailures >= 3;
  }

  /** Reset stuck detection on success. */
  trackSuccess(): void {
    this.lastFailedAction = "";
    this.consecutiveFailures = 0;
  }

  // ── Debug state ────────────────────────────────────────────────────
  /** Whether an LLM call is currently in-flight (set externally by GameWorld). */
  debugThinking = false;
  /** The raw text of the last LLM response. */
  debugLastResponse = "";
  /** The last action JSON returned by the LLM. */
  debugLastAction = "";
  /** Whether the last action succeeded. */
  debugLastResult = "";
  /** Circular buffer of recent actions (newest first, max 10). */
  debugHistory: { action: string; result: string; time: number; changes: string }[] = [];
  /** Previous visible entity states, keyed by "type:x,y" → details string. */
  private prevVisibleEntities = new Map<string, string>();

  /**
   * Diff current visible entities against previous snapshot.
   * Returns a compact string of changes (HP drops, state changes, new/gone entities).
   */
  diffVisibleEntities(entities: { type: string; x: number; y: number; details: string }[]): string {
    const curr = new Map<string, string>();
    for (const e of entities) {
      curr.set(`${e.type}:${e.x},${e.y}`, e.details);
    }

    const diffs: string[] = [];

    // Changed or new
    for (const [key, details] of curr) {
      const prev = this.prevVisibleEntities.get(key);
      if (prev == null) {
        // Only note truly interesting new things, skip ground tiles
        if (!details.includes("water") && !details.includes("grass")) {
          diffs.push(`NEW ${key} ${details}`);
        }
      } else if (prev !== details) {
        diffs.push(`${key}: ${prev} → ${details}`);
      }
    }

    // Gone from vision
    for (const [key] of this.prevVisibleEntities) {
      if (!curr.has(key)) {
        diffs.push(`GONE ${key}`);
      }
    }

    this.prevVisibleEntities = curr;
    return diffs.length > 0 ? diffs.slice(0, 6).join("; ") : "";
  }

  /** Push an entry into the action history (keeps newest 10). */
  pushDebugHistory(action: string, result: string, changes = ""): void {
    this.debugHistory.unshift({ action, result, time: Date.now(), changes });
    if (this.debugHistory.length > 10) this.debugHistory.length = 10;
  }

  /** Add a message to the persistent chat history (sent or received). */
  pushChatHistory(msg: ChatMessage): void {
    this.chatHistory.push(msg);
    if (this.chatHistory.length > NPC.MAX_CHAT_HISTORY) {
      this.chatHistory.splice(0, this.chatHistory.length - NPC.MAX_CHAT_HISTORY);
    }
  }

  // Combat tracking for passive health regen
  private combatTimer = 10000;
  private regenAccum = 0;

  constructor(tileX: number, tileY: number, def: NPCDefinition, saved?: Partial<NPCSaveState>) {
    super({
      pos: ex.vec(tileCenter(tileX), tileCenter(tileY)),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 10,
    });

    this.npcId = def.npcId;
    this.personality = saved?.personality ?? def.personality;
    this.npcName = this.personality.name;
    this.appearance = saved?.appearance ?? def.appearance;

    this.tileX = tileX;
    this.tileY = tileY;
    this.targetX = tileX;
    this.targetY = tileY;

    if (saved?.facing) this.facing = saved.facing;
    if (saved?.sleeping) this.sleeping = saved.sleeping;
    if (saved?.todoList) this.todoList = saved.todoList.map((t) => ({ ...t }));
    if (saved?.knownLocations) this.knownLocations = { ...saved.knownLocations };
    if (saved?.actionLog) this.actionLog = saved.actionLog.map((e) => ({ ...e }));
    if (saved?.claimedBed) this.claimedBed = { ...saved.claimedBed };

    // Vitals & inventory
    this.vitals = saved?.vitals ?? defaultVitals();
    this.inventory =
      saved?.bag && saved?.equipment
        ? { equipment: saved.equipment, bag: saved.bag, maxWeight: saved.maxWeight ?? 50 }
        : defaultInventory(this.appearance);

    // Memory
    this.memory = saved?.memory ? deserializeMemory(saved.memory) : createMemory();

    // Sprites
    this.spriteSheet = compositeCharacter(this.appearance, this.inventory.equipment);

    // Weapon overlay (same pattern as Player)
    this.weaponActor = new ex.Actor({ anchor: ex.vec(0.5, 0.5), z: 11 });
    this.addChild(this.weaponActor);
    this.setupWeaponOverlay();

    this.showFrame(DIR_OFFSET[this.facing]);
  }

  // ── Sprite helpers ─────────────────────────────────────────────────

  private setupWeaponOverlay(): void {
    const mainHand = this.inventory.equipment[EquipmentSlot.MainHand];
    this.weaponSheet = mainHand ? getWeaponSpriteSheet(mainHand.id) : null;
    if (!this.weaponSheet) {
      this.weaponActor.graphics.visible = false;
    }
  }

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

  /** Re-composite the sprite sheet after equipment changes. */
  refreshSprite(): void {
    this.spriteSheet = compositeCharacter(this.appearance, this.inventory.equipment);
    this.setupWeaponOverlay();
    this.showFrame(DIR_OFFSET[this.facing]);
  }

  // ── Movement (Creature pattern) ────────────────────────────────────

  setBlockedCheck(fn: BlockedCheck): void {
    this.isBlocked = fn;
  }

  isMoving(): boolean {
    return this.moving;
  }

  moveToTile(dir: Direction): boolean {
    if (this.moving || this.isDead) return false;
    if (this.actionState !== "idle" && this.actionState !== "moving") return false;

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
    this.actionState = "moving";

    const walkFrameIdx = DIR_OFFSET[this.facing] + 1 + this.walkFrame;
    this.showFrame(walkFrameIdx);

    const goalX = tileCenter(this.targetX);
    const goalY = tileCenter(this.targetY);
    const vx = goalX - this.pos.x;
    const vy = goalY - this.pos.y;
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len > 0) {
      const speed = this.vitals.energy <= 0 ? MOVE_SPEED / 2 : MOVE_SPEED;
      this.vel = ex.vec((vx / len) * speed, (vy / len) * speed);
    }

    return true;
  }

  /** Face a direction without moving. */
  face(dir: Direction): void {
    this.facing = dir;
    if (this.actionState === "idle") {
      this.showFrame(DIR_OFFSET[this.facing]);
    }
  }

  getFacing(): Direction {
    return this.facing;
  }

  getFacingTile(): { x: number; y: number } {
    return {
      x: this.tileX + DIR_DX[this.facing],
      y: this.tileY + DIR_DY[this.facing],
    };
  }

  getTileX(): number {
    return this.tileX;
  }

  getTileY(): number {
    return this.tileY;
  }

  // ── Action state machines (Player pattern, no keyboard) ────────────

  startPicking(): void {
    this.actionState = "picking";
    this.actionTimer = PICK_DURATION_MS;
    this.showFrame(PICK_DIR_OFFSET[this.facing]);
  }

  startDrinking(): void {
    this.actionState = "drinking";
    this.actionTimer = DRINK_DURATION_MS;
    this.showFrame(DRINK_DIR_OFFSET[this.facing]);
  }

  startPickingUpItem(): void {
    this.actionState = "pickingUp";
    this.actionTimer = PICKUP_DURATION_MS;
    this.showFrame(PICKUP_DIR_OFFSET[this.facing]);
  }

  startAttack(): AttackStyle {
    const mainHand = this.inventory.equipment[EquipmentSlot.MainHand];
    let style: AttackStyle;
    if (mainHand && SHOOT_ITEM_IDS.has(mainHand.id)) {
      style = "shoot";
    } else if (mainHand && THRUST_ITEM_IDS.has(mainHand.id)) {
      style = "thrust";
    } else {
      style = "swing";
    }
    this.actionState = "attacking";
    this.attackStyle = style;
    this.actionTimer = ATTACK_DURATION_MS;

    const offsets =
      style === "shoot"
        ? SHOOT_DIR_OFFSET
        : style === "thrust"
          ? THRUST_DIR_OFFSET
          : SWING_DIR_OFFSET;
    this.showFrame(offsets[this.facing]);

    return style;
  }

  startWaiting(durationMs: number): void {
    this.actionState = "waiting";
    this.waitTimer = Math.max(1000, Math.min(8000, durationMs));
  }

  enterSleep(): void {
    this.actionState = "sleeping";
    this.sleeping = true;
  }

  exitSleep(): void {
    this.actionState = "idle";
    this.sleeping = false;
    this.showFrame(DIR_OFFSET[this.facing]);
  }

  /** Returns true if the NPC cannot take a new action right now. */
  isBusy(): boolean {
    return this.actionState !== "idle" || this.moving || this.isDead;
  }

  isOverEncumbered(): boolean {
    return totalWeight(this.inventory) > this.inventory.maxWeight;
  }

  // ── Combat ─────────────────────────────────────────────────────────

  takeCombatDamage(amount: number): void {
    this.vitals = {
      ...this.vitals,
      health: clampVital(this.vitals.health - amount),
    };
    this.combatTimer = 0;
    this.regenAccum = 0;

    // Degrade armor
    const armorSlots = [
      EquipmentSlot.Head,
      EquipmentSlot.Torso,
      EquipmentSlot.Hands,
      EquipmentSlot.Legs,
      EquipmentSlot.Feet,
      EquipmentSlot.OffHand,
    ] as const;

    let spriteChanged = false;
    for (const slot of armorSlots) {
      const item = this.inventory.equipment[slot];
      if (item && item.durability != null) {
        item.durability -= 1;
        if (item.durability <= 0) {
          this.inventory.equipment[slot] = null;
          spriteChanged = true;
        }
      }
    }
    if (spriteChanged) this.refreshSprite();
  }

  // ── Update loop ────────────────────────────────────────────────────

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    if (this.isDead) return;

    // --- Vitals ---
    this.vitals = updateVitals(this.vitals, delta, this.sleeping, this.sleepEnergyRate);

    // Combat timer
    if (this.combatTimer < 10000) this.combatTimer += delta;

    // Passive health regen
    const takingVitalsDamage = this.vitals.hunger <= 0 || this.vitals.thirst <= 0;
    if (
      this.vitals.health > 0 &&
      this.vitals.health < 100 &&
      this.combatTimer >= OUT_OF_COMBAT_MS &&
      !takingVitalsDamage
    ) {
      this.regenAccum += delta;
      if (this.regenAccum >= REGEN_INTERVAL_MS) {
        this.regenAccum -= REGEN_INTERVAL_MS;
        this.vitals = { ...this.vitals, health: clampVital(this.vitals.health + 1) };
      }
    } else if (this.combatTimer < OUT_OF_COMBAT_MS || takingVitalsDamage) {
      this.regenAccum = 0;
    }

    // --- Sleeping — auto-wake when full energy or survival emergency ---
    if (this.sleeping) {
      if (this.vitals.energy >= 1000 || this.vitals.thirst <= 20 || this.vitals.hunger <= 10) {
        this.exitSleep();
      }
      return;
    }

    // --- Animation state machines ---
    if (this.actionState === "picking") {
      this.actionTimer -= delta;
      const halfDuration = PICK_DURATION_MS / 2;
      const pickBase = PICK_DIR_OFFSET[this.facing];
      this.showFrame(this.actionTimer > halfDuration ? pickBase : pickBase + 1);
      if (this.actionTimer <= 0) {
        this.actionState = "idle";
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    if (this.actionState === "drinking") {
      this.actionTimer -= delta;
      const q = DRINK_DURATION_MS / 4;
      const base = DRINK_DIR_OFFSET[this.facing];
      const poseIdx =
        this.actionTimer > q * 3 ? 0 : this.actionTimer > q * 2 ? 1 : this.actionTimer > q ? 2 : 3;
      this.showFrame(base + poseIdx);
      if (this.actionTimer <= 0) {
        this.actionState = "idle";
        this.vitals = {
          ...this.vitals,
          thirst: clampVital(this.vitals.thirst + DRINK_THIRST_RESTORE),
        };
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    if (this.actionState === "pickingUp") {
      this.actionTimer -= delta;
      const q = PICKUP_DURATION_MS / 4;
      const base = PICKUP_DIR_OFFSET[this.facing];
      const poseIdx =
        this.actionTimer > q * 3 ? 0 : this.actionTimer > q * 2 ? 1 : this.actionTimer > q ? 2 : 3;
      this.showFrame(base + poseIdx);
      if (this.actionTimer <= 0) {
        this.actionState = "idle";
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    if (this.actionState === "attacking" && this.attackStyle) {
      this.actionTimer -= delta;
      const third = ATTACK_DURATION_MS / 3;
      const offsets =
        this.attackStyle === "shoot"
          ? SHOOT_DIR_OFFSET
          : this.attackStyle === "thrust"
            ? THRUST_DIR_OFFSET
            : SWING_DIR_OFFSET;
      const base = offsets[this.facing];
      const poseIdx = this.actionTimer > third * 2 ? 0 : this.actionTimer > third ? 1 : 2;
      this.showFrame(base + poseIdx);
      if (this.actionTimer <= 0) {
        this.actionState = "idle";
        this.attackStyle = null;
        this.showFrame(DIR_OFFSET[this.facing]);
      }
      return;
    }

    if (this.actionState === "waiting") {
      this.waitTimer -= delta;
      if (this.waitTimer <= 0) {
        this.actionState = "idle";
      }
      return;
    }

    // --- Movement interpolation ---
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
        this.actionState = "idle";
        this.showFrame(DIR_OFFSET[this.facing]);
      }
    }
  }

  // ── Serialization ──────────────────────────────────────────────────

  getState(): NPCSaveState {
    return {
      npcId: this.npcId,
      tileX: this.tileX,
      tileY: this.tileY,
      facing: this.facing,
      appearance: this.appearance,
      vitals: { ...this.vitals },
      equipment: { ...this.inventory.equipment },
      bag: this.inventory.bag.map((item) => ({ ...item })),
      maxWeight: this.inventory.maxWeight,
      personality: this.personality,
      memory: serializeMemory(this.memory),
      sleeping: this.sleeping,
      todoList: this.todoList.map((t) => ({ ...t })),
      claimedBed: this.claimedBed ? { ...this.claimedBed } : null,
      knownLocations: { ...this.knownLocations },
      actionLog: this.actionLog.map((e) => ({ ...e })),
    };
  }
}
