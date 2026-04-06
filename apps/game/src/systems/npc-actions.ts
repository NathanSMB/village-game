/**
 * NPC Action Executor
 *
 * Maps parsed JSON actions from the LLM into concrete game method calls.
 * Each action validates preconditions, faces the NPC correctly, starts
 * the animation, and schedules the game effect after the animation delay.
 */

import type { NPC } from "../actors/npc.ts";
import type { Direction } from "../actors/player.ts";
import type { ChatMode } from "../types/chat.ts";
import type { NPCAction, ActionResult } from "../types/npc.ts";
import { EquipmentSlot } from "../types/item.ts";
import type { Item } from "../types/item.ts";
import {
  addItemToBag,
  equipItem,
  unequipItem,
  consumeItem,
  consumeArrow,
} from "../types/inventory.ts";
import { canCraft, craft } from "../types/crafting.ts";
import { RECIPES } from "../data/recipes.ts";
import { COOKING_RECIPE_MAP } from "../data/cooking.ts";
import { ITEMS, createItemCopy } from "../data/items.ts";
import { addNote, removeNote } from "./npc-memory.ts";
import type { BerryBush } from "../actors/berry-bush.ts";
import type { Tree } from "../actors/tree.ts";
import type { BigRock } from "../actors/big-rock.ts";
import type { Building } from "../actors/building.ts";
import type { EdgeBuilding } from "../actors/edge-building.ts";
import type { GroundItemStack } from "../actors/ground-item-stack.ts";

// ── Interface exposed by GameWorld for NPC actions ───────────────────

export interface GameWorldNPCInterface {
  // Queries
  getBushAt(x: number, y: number): BerryBush | undefined;
  getTreeAt(x: number, y: number): Tree | undefined;
  getRockAt(x: number, y: number): BigRock | undefined;
  getGroundItemsAt(x: number, y: number): GroundItemStack | undefined;
  getBuildingAt(x: number, y: number): Building | undefined;
  getEdgeBetween(fromX: number, fromY: number, toX: number, toY: number): EdgeBuilding | undefined;
  isWaterTile(x: number, y: number): boolean;
  isBlockedTile(x: number, y: number): boolean;
  getPlayerInfo(): { tileX: number; tileY: number; name: string } | null;
  /** Get the current tile position of a creature by type and last-known position. */
  getCreaturePosition(targetType: string, x: number, y: number): { x: number; y: number } | null;

  // Mutating actions
  npcDropItem(npc: NPC, item: Item, tileX: number, tileY: number): void;
  npcToggleDoor(edge: EdgeBuilding): void;
  npcToggleTileDoor(building: Building): void;
  npcChat(npc: NPC, text: string, mode: ChatMode): void;
  npcPlaceBuilding(
    buildingId: string,
    x: number,
    y: number,
    rotation: number,
    orientation?: string,
  ): boolean;
  dropResourceNear(cx: number, cy: number, item: Item): void;
  findPathDirections(fromX: number, fromY: number, toX: number, toY: number): Direction[] | null;
  isBedClaimed(x: number, y: number): boolean;
  claimBed(npc: NPC, x: number, y: number): boolean;
  npcAttackAt(npc: NPC, x: number, y: number): void;
  /** Spawn an arrow projectile from the NPC in the given direction. */
  npcShootArrow(npc: NPC, direction: Direction): void;
  /** Get the Chebyshev distance to the nearest listener (player or other NPC). */
  getNearestListenerDistance(npc: NPC): number;
  /** Get the Chebyshev distance to a named entity (player name or NPC name). Returns Infinity if not found. */
  getDistanceToNamed(npc: NPC, name: string): number;
  /** Check if any hologram buildings exist on the map. */
  hasUncompletedHolograms(): boolean;
  /** Get the position of the first uncompleted hologram, or null. */
  getHologramLocation(): { x: number; y: number } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

const DIR_DX: Record<Direction, number> = { left: -1, right: 1, up: 0, down: 0 };
const DIR_DY: Record<Direction, number> = { up: -1, down: 1, left: 0, right: 0 };
const CARDINAL_DIRS: Direction[] = ["up", "down", "left", "right"];

/** Find which adjacent tile has a resource, and return the direction to face it. */
function findAdjacentDir(
  npcX: number,
  npcY: number,
  test: (x: number, y: number) => boolean,
): Direction | null {
  for (const dir of CARDINAL_DIRS) {
    const tx = npcX + DIR_DX[dir];
    const ty = npcY + DIR_DY[dir];
    if (test(tx, ty)) return dir;
  }
  return null;
}

/** Get the direction from (fromX,fromY) to an adjacent tile (toX,toY), or null if not adjacent. */
function directionTo(fromX: number, fromY: number, toX: number, toY: number): Direction | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 1 && dy === 0) return "right";
  if (dx === -1 && dy === 0) return "left";
  if (dx === 0 && dy === 1) return "down";
  if (dx === 0 && dy === -1) return "up";
  return null;
}

/**
 * If the target (x,y) is adjacent, return the direction. If not, pathfind to an
 * adjacent tile and queue the action as pendingAction. Returns "queued" if walking,
 * the Direction if adjacent, or null if unreachable.
 */
function walkToTargetOrAct(
  npc: NPC,
  tx: number,
  ty: number,
  queuedAction: import("../types/npc.ts").NPCAction,
  world: GameWorldNPCInterface,
): Direction | "queued" | null {
  // Already adjacent?
  const adj = directionTo(npc.tileX, npc.tileY, tx, ty);
  if (adj) return adj;

  // If target is too far, walk toward it in a shorter hop first
  const dist = Math.abs(tx - npc.tileX) + Math.abs(ty - npc.tileY);
  if (dist > MAX_MOVE_DISTANCE) {
    const ratio = MAX_MOVE_DISTANCE / dist;
    const midX = Math.round(npc.tileX + (tx - npc.tileX) * ratio);
    const midY = Math.round(npc.tileY + (ty - npc.tileY) * ratio);
    const dirs = world.findPathDirections(npc.tileX, npc.tileY, midX, midY);
    if (dirs && dirs.length > 0) {
      npc.pendingPath = dirs;
      npc.pendingAction = queuedAction; // re-attempt original action after arriving
      npc.moveToTile(npc.pendingPath.shift()!);
      return "queued";
    }
    return null;
  }

  // Pathfind to a tile adjacent to the target
  for (const dir of CARDINAL_DIRS) {
    const ax = tx + DIR_DX[dir];
    const ay = ty + DIR_DY[dir];
    const dirs = world.findPathDirections(npc.tileX, npc.tileY, ax, ay);
    if (dirs && dirs.length > 0) {
      npc.pendingPath = dirs;
      npc.pendingAction = queuedAction;
      npc.moveToTile(npc.pendingPath.shift()!);
      return "queued";
    }
  }
  return null;
}

const BOW_RANGE = 5;
const SHOOT_ITEM_IDS = new Set(["bow"]);

function hasRangedWeapon(npc: NPC): boolean {
  const mainHand = npc.inventory.equipment[EquipmentSlot.MainHand];
  return mainHand != null && SHOOT_ITEM_IDS.has(mainHand.id);
}

function hasAmmo(npc: NPC): boolean {
  const offHand = npc.inventory.equipment[EquipmentSlot.OffHand];
  return offHand != null && offHand.id === "arrow";
}

/**
 * Like walkToTargetOrAct but stops within `range` tiles (Chebyshev distance)
 * instead of adjacent. Used for ranged attacks.
 */
function walkToRangeAndAct(
  npc: NPC,
  tx: number,
  ty: number,
  range: number,
  queuedAction: import("../types/npc.ts").NPCAction,
  world: GameWorldNPCInterface,
): Direction | "queued" | null {
  // Already in range?
  const dist = Math.max(Math.abs(npc.tileX - tx), Math.abs(npc.tileY - ty));
  if (dist <= range) {
    // Face toward target
    const dx = tx - npc.tileX;
    const dy = ty - npc.tileY;
    // Pick dominant axis for facing
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? "right" : "left";
    }
    return dy > 0 ? "down" : "up";
  }

  // Need to walk closer — find a tile within range
  // Try tiles along cardinal directions from target, at range distance
  for (let r = range; r >= 1; r--) {
    const candidates = [
      { x: tx - r, y: ty },
      { x: tx + r, y: ty },
      { x: tx, y: ty - r },
      { x: tx, y: ty + r },
    ];
    for (const c of candidates) {
      const dirs = world.findPathDirections(npc.tileX, npc.tileY, c.x, c.y);
      if (dirs && dirs.length > 0) {
        npc.pendingPath = dirs;
        npc.pendingAction = queuedAction;
        npc.moveToTile(npc.pendingPath.shift()!);
        return "queued";
      }
    }
  }
  return null;
}

// ── Timing constants (same as player) ────────────────────────────────

const PICK_DELAY = 450;
const PICKUP_DELAY = 700;
const UNARMED_DAMAGE = 1;

// ── Main executor ────────────────────────────────────────────────────

export function executeNPCAction(
  npc: NPC,
  action: NPCAction,
  world: GameWorldNPCInterface,
): ActionResult {
  // Exhaustion: when energy is 0, only sleep, wake_up, plan, think, consume, chat are allowed
  if (npc.vitals.energy <= 0) {
    const allowed = new Set([
      "sleep",
      "wake_up",
      "plan",
      "think",
      "complete_step",
      "complete_todo",
      "consume",
      "chat",
      "claim_bed",
    ]);
    if (!allowed.has(action.action)) {
      return {
        success: false,
        reason: "Too exhausted! You can only sleep, eat, or chat. Find a bed!",
      };
    }
  }

  switch (action.action) {
    case "plan":
      // Handled by GameWorld — routed to thinking model
      return { success: true, reason: "Planning..." };

    case "modify_plan":
      // Handled by GameWorld — routed to thinking model
      return { success: true, reason: "Modifying plan..." };

    case "complete_step":
      return execCompleteStep(npc, action.stepIndex);

    case "complete_todo":
      // Backwards compat alias — route to complete_step
      return execCompleteStep(npc, action.todoIndex);

    case "think":
      // Handled specially by GameWorld — not executed here
      return { success: true, reason: "Thinking..." };

    case "move_to":
      return execMoveTo(npc, action.x, action.y, world);

    case "pick_bush":
      return execPickBush(npc, world, action.x, action.y);

    case "chop_tree":
      return execChopTree(npc, world, action.x, action.y);

    case "mine_rock":
      return execMineRock(npc, world, action.x, action.y);

    case "drink_water":
      return execDrinkWater(npc, world, action.x, action.y);

    case "pick_up_item":
      return execPickUpItem(npc, action.itemId, world, action.x, action.y);

    case "attack":
      return execAttack(npc, world, action.direction, action.targetType, action.x, action.y);

    case "craft":
      return execCraft(npc, action.recipeId);

    case "cook":
      return execCook(npc, action.inputItemId, world, action.x, action.y);

    case "build_plan":
      return execBuildPlan(
        npc,
        action.buildingId,
        action.x,
        action.y,
        action.rotation ?? 0,
        action.orientation,
        world,
      );

    case "construct":
      return execConstruct(npc, action.x, action.y, world);

    case "equip":
      return execEquip(npc, action.bagIndex);

    case "unequip":
      return execUnequip(npc, action.slot);

    case "consume":
      return execConsume(npc, action.bagIndex);

    case "drop_item":
      return execDropItem(npc, action.bagIndex, world);

    case "open_door":
    case "close_door":
      return execToggleDoor(npc, world, action.x, action.y);

    case "claim_bed":
      return execClaimBed(npc, world, action.x, action.y);

    case "sleep":
      return execSleep(npc, world, action.x, action.y);

    case "wake_up":
      return execWakeUp(npc);

    case "store_item":
      return execStoreItem(npc, action.bagIndex, world, action.x, action.y);

    case "retrieve_item":
      return execRetrieveItem(npc, action.slotIndex, world, action.x, action.y);

    case "chat":
      return execChat(npc, action.text, world, action.target);

    case "remember":
      return execRemember(npc, action.note);

    case "forget":
      return execForget(npc, action.noteIndex);

    case "wait":
      return execWait(npc, action.durationMs);

    default:
      return { success: false, reason: "Unknown action" };
  }
}

// ── Individual action executors ──────────────────────────────────────

function execCompleteStep(npc: NPC, stepIndex: number): ActionResult {
  if (!npc.currentGoal) {
    return { success: false, reason: "No current goal" };
  }
  const { steps } = npc.currentGoal;
  if (stepIndex < 0 || stepIndex >= steps.length) {
    return { success: false, reason: "Invalid step index" };
  }
  const step = steps[stepIndex];
  if (step.done) {
    return { success: false, reason: "Already completed" };
  }
  step.done = true;

  // Check if all steps are done — flag for auto-replan
  const allDone = steps.every((s) => s.done);
  if (allDone) {
    npc.needsReplan = true;
  }

  return { success: true, reason: `Done: ${step.task}${allDone ? " (all steps complete!)" : ""}` };
}

/** Max tiles to pathfind in one move_to. Longer paths are clamped to a midpoint. */
const MAX_MOVE_DISTANCE = 15;

function execMoveTo(npc: NPC, x: number, y: number, world: GameWorldNPCInterface): ActionResult {
  let targetX = x;
  let targetY = y;

  // If the destination is too far, walk toward it in a shorter hop
  const dist = Math.abs(x - npc.tileX) + Math.abs(y - npc.tileY);
  if (dist > MAX_MOVE_DISTANCE) {
    const ratio = MAX_MOVE_DISTANCE / dist;
    targetX = Math.round(npc.tileX + (x - npc.tileX) * ratio);
    targetY = Math.round(npc.tileY + (y - npc.tileY) * ratio);
  }

  let dirs = world.findPathDirections(npc.tileX, npc.tileY, targetX, targetY);

  // If target tile is blocked (e.g. water), try adjacent tiles instead
  if (!dirs || dirs.length === 0) {
    let bestDirs: typeof dirs = null;
    let bestDist = Infinity;
    for (const dir of CARDINAL_DIRS) {
      const ax = targetX + DIR_DX[dir];
      const ay = targetY + DIR_DY[dir];
      const adjDirs = world.findPathDirections(npc.tileX, npc.tileY, ax, ay);
      if (adjDirs && adjDirs.length > 0 && adjDirs.length < bestDist) {
        bestDirs = adjDirs;
        bestDist = adjDirs.length;
      }
    }
    dirs = bestDirs;
  }

  if (!dirs || dirs.length === 0) {
    return {
      success: false,
      reason: `No path to (${targetX},${targetY}) — try a different direction or closer target`,
    };
  }
  // Store remaining path on the NPC, pop first step now
  npc.pendingPath = dirs.slice(1);
  const moved = npc.moveToTile(dirs[0]);
  if (!moved) {
    npc.pendingPath = [];
    return { success: false, reason: "First step blocked" };
  }
  const isPartial = targetX !== x || targetY !== y;
  return {
    success: true,
    reason: isPartial
      ? `Walking partway to (${targetX},${targetY}), destination (${x},${y}) is too far — will continue next turn`
      : `Moving to (${x},${y})`,
  };
}

// ── Auto-walk interaction executors ──────────────────────────────────
// All these follow the same pattern: if target coords are provided and not adjacent,
// pathfind there and queue as pendingAction. Otherwise execute immediately.

function execPickBush(
  npc: NPC,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "pick_bush" }, world);
    if (result === "queued") return { success: true, reason: "Walking to bush" };
    if (result === null) return { success: false, reason: "Cannot reach bush" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (bx, by) => {
    const b = world.getBushAt(bx, by);
    return b != null && b.canPick();
  });
  if (!dir) return { success: false, reason: "No berry bush with berries nearby" };
  npc.face(dir);
  npc.startPicking();
  const facing = npc.getFacingTile();
  setTimeout(() => {
    const bush = world.getBushAt(facing.x, facing.y);
    const berry = bush?.pick();
    if (berry) addItemToBag(npc.inventory, berry);
  }, PICK_DELAY);
  return { success: true };
}

function execChopTree(
  npc: NPC,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "chop_tree" }, world);
    if (result === "queued") return { success: true, reason: "Walking to tree" };
    if (result === null) return { success: false, reason: "Cannot reach tree" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (tx, ty) => {
    const t = world.getTreeAt(tx, ty);
    return t != null && !t.isChoppedDown();
  });
  if (!dir) return { success: false, reason: "No tree nearby" };
  npc.face(dir);
  npc.startAttack();
  const facing = npc.getFacingTile();
  setTimeout(() => {
    const tree = world.getTreeAt(facing.x, facing.y);
    if (!tree) return;
    const mainHand = npc.inventory.equipment[EquipmentSlot.MainHand];
    const canonical = mainHand ? ITEMS[mainHand.id] : null;
    const baseDamage = canonical ? (canonical.stats.attack ?? 0) : UNARMED_DAMAGE;
    const result = tree.takeDamage(baseDamage * (canonical?.toolMultipliers?.tree ?? 1));
    for (const drop of result.drops) world.dropResourceNear(tree.tileX, tree.tileY, drop);
    if (mainHand && mainHand.durability != null) {
      mainHand.durability -= 1;
      if (mainHand.durability <= 0) {
        npc.inventory.equipment[EquipmentSlot.MainHand] = null;
        npc.refreshSprite();
      }
    }
  }, 200);
  return { success: true };
}

function execMineRock(
  npc: NPC,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "mine_rock" }, world);
    if (result === "queued") return { success: true, reason: "Walking to rock" };
    if (result === null) return { success: false, reason: "Cannot reach rock" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (rx, ry) => world.getRockAt(rx, ry) != null);
  if (!dir) return { success: false, reason: "No rock nearby" };
  npc.face(dir);
  npc.startAttack();
  const facing = npc.getFacingTile();
  setTimeout(() => {
    const rock = world.getRockAt(facing.x, facing.y);
    if (!rock) return;
    const mainHand = npc.inventory.equipment[EquipmentSlot.MainHand];
    const canonical = mainHand ? ITEMS[mainHand.id] : null;
    const baseDamage = canonical ? (canonical.stats.attack ?? 0) : UNARMED_DAMAGE;
    const drops = rock.takeDamage(baseDamage * (canonical?.toolMultipliers?.mineable ?? 1));
    for (const drop of drops) world.dropResourceNear(rock.tileX, rock.tileY, drop);
    if (mainHand && mainHand.durability != null) {
      mainHand.durability -= 1;
      if (mainHand.durability <= 0) {
        npc.inventory.equipment[EquipmentSlot.MainHand] = null;
        npc.refreshSprite();
      }
    }
  }, 200);
  return { success: true };
}

function execDrinkWater(
  npc: NPC,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "drink_water" }, world);
    if (result === "queued") return { success: true, reason: "Walking to water" };
    if (result === null) return { success: false, reason: "Cannot reach water" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (wx, wy) => world.isWaterTile(wx, wy));
  if (!dir) return { success: false, reason: "No water nearby" };
  npc.face(dir);
  npc.startDrinking();
  return { success: true };
}

function execPickUpItem(
  npc: NPC,
  itemId: string,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "pick_up_item", itemId }, world);
    if (result === "queued") return { success: true, reason: `Walking to pick up ${itemId}` };
    if (result === null) return { success: false, reason: `Cannot reach ${itemId}` };
  }
  // Search own tile + adjacent
  const tilesToCheck: { tx: number; ty: number; dir: Direction | null }[] = [
    { tx: npc.tileX, ty: npc.tileY, dir: null },
    ...CARDINAL_DIRS.map((d) => ({ tx: npc.tileX + DIR_DX[d], ty: npc.tileY + DIR_DY[d], dir: d })),
  ];
  for (const { tx, ty, dir } of tilesToCheck) {
    const stack = world.getGroundItemsAt(tx, ty);
    if (!stack || stack.isEmpty()) continue;
    const idx = stack.getItems().findIndex((i) => i.id === itemId);
    if (idx >= 0) {
      if (dir) npc.face(dir);
      npc.startPickingUpItem();
      setTimeout(() => {
        const s = world.getGroundItemsAt(tx, ty);
        if (!s || s.isEmpty()) return;
        const item = s.removeItem(idx);
        if (item) addItemToBag(npc.inventory, item);
      }, PICKUP_DELAY);
      return { success: true };
    }
  }
  return { success: false, reason: `No ${itemId} nearby` };
}

function execAttack(
  npc: NPC,
  world: GameWorldNPCInterface,
  direction?: Direction,
  targetType?: string,
  x?: number,
  y?: number,
): ActionResult {
  const ranged = hasRangedWeapon(npc);
  const ammo = hasAmmo(npc);

  // Target-based attack: auto-walk to creature and attack (melee or ranged)
  if (targetType && x != null && y != null) {
    const pos = world.getCreaturePosition(targetType, x, y);
    if (!pos) return { success: false, reason: `Target ${targetType} not found` };

    if (ranged && ammo) {
      // Ranged: walk to within BOW_RANGE, then shoot
      const result = walkToRangeAndAct(
        npc,
        pos.x,
        pos.y,
        BOW_RANGE,
        { action: "attack", targetType, x: pos.x, y: pos.y },
        world,
      );
      if (result === "queued") return { success: true, reason: `Moving into range` };
      if (result === null) return { success: false, reason: `Cannot get in range` };
      // In range — face and shoot
      npc.face(result);
      npc.startAttack();
      consumeArrow(npc.inventory);
      npc.refreshSprite();
      setTimeout(() => world.npcShootArrow(npc, result), 200);
      return { success: true, reason: "Shooting" };
    }

    // Melee: walk adjacent
    const result = walkToTargetOrAct(
      npc,
      pos.x,
      pos.y,
      { action: "attack", targetType, x: pos.x, y: pos.y },
      world,
    );
    if (result === "queued") return { success: true, reason: `Chasing ${targetType}` };
    if (result === null) return { success: false, reason: `Cannot reach ${targetType}` };
    npc.face(result);
    npc.startAttack();
    setTimeout(() => world.npcAttackAt(npc, pos.x, pos.y), 200);
    return { success: true };
  }

  // Direction-based or default facing attack
  if (direction) npc.face(direction);
  npc.startAttack();

  if (ranged && ammo) {
    // Shoot arrow in facing direction
    const facing = npc.getFacing();
    consumeArrow(npc.inventory);
    npc.refreshSprite();
    setTimeout(() => world.npcShootArrow(npc, facing), 200);
    return { success: true, reason: "Shooting" };
  }

  // Melee
  const facing = npc.getFacingTile();
  setTimeout(() => world.npcAttackAt(npc, facing.x, facing.y), 200);
  return { success: true };
}

function execCraft(npc: NPC, recipeId: string): ActionResult {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { success: false, reason: "Unknown recipe" };
  if (!canCraft(npc.inventory, recipe)) return { success: false, reason: "Missing materials" };
  craft(npc.inventory, recipe);
  npc.refreshSprite();
  return { success: true };
}

function execCook(
  npc: NPC,
  inputItemId: string,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "cook", inputItemId }, world);
    if (result === "queued") return { success: true, reason: "Walking to fire" };
    if (result === null) return { success: false, reason: "Cannot reach fire" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (fx, fy) => {
    const b = world.getBuildingAt(fx, fy);
    return b != null && b.isBurning;
  });
  if (!dir) return { success: false, reason: "No burning fire nearby" };
  npc.face(dir);
  const recipe = COOKING_RECIPE_MAP[inputItemId];
  if (!recipe) return { success: false, reason: "Cannot cook that" };
  const bagIdx = npc.inventory.bag.findIndex((item) => item.id === inputItemId);
  if (bagIdx === -1) return { success: false, reason: "Item not in inventory" };
  npc.inventory.bag.splice(bagIdx, 1);
  const cookedItem = ITEMS[recipe.outputId];
  if (cookedItem) addItemToBag(npc.inventory, createItemCopy(recipe.outputId));
  return { success: true };
}

function execConstruct(npc: NPC, x: number, y: number, world: GameWorldNPCInterface): ActionResult {
  // Check if hammer is equipped
  const mainHand = npc.inventory.equipment[EquipmentSlot.MainHand];
  const hasHammerEquipped = mainHand != null && mainHand.id === "hammer";

  if (!hasHammerEquipped) {
    // Try to auto-equip hammer from bag
    const hammerIdx = npc.inventory.bag.findIndex((i) => i.id === "hammer");
    if (hammerIdx >= 0) {
      equipItem(npc.inventory, hammerIdx);
      npc.refreshSprite();
      return { success: true, reason: "Equipped hammer — now use construct again" };
    }
    return {
      success: false,
      reason: "No hammer! Craft one first (1 small_rock + 1 branch) then equip it.",
    };
  }

  // Check if target is a hologram
  const building = world.getBuildingAt(x, y);
  if (!building || building.state !== "hologram") {
    return { success: false, reason: `No hologram at (${x},${y})` };
  }

  // Auto-walk to adjacent tile and attack (same pattern as other auto-walk actions)
  const result = walkToTargetOrAct(npc, x, y, { action: "construct", x, y }, world);
  if (result === "queued") return { success: true, reason: "Walking to hologram" };
  if (result === null) return { success: false, reason: "Cannot reach hologram" };

  // Adjacent — check if we have the next required material
  const nextRequired = building.getNextRequired();
  if (nextRequired) {
    const hasMaterial = npc.inventory.bag.some((i) => i.id === nextRequired);
    if (!hasMaterial) {
      const itemName = ITEMS[nextRequired]?.name ?? nextRequired;
      return {
        success: false,
        reason: `Need [${itemName}] (${nextRequired}) in bag to deliver! Gather it first.`,
      };
    }
  }

  // Face and attack the hologram to deliver materials
  npc.face(result);
  npc.startAttack();
  setTimeout(() => world.npcAttackAt(npc, x, y), 200);
  return { success: true, reason: `Constructing — delivering ${nextRequired ?? "materials"}` };
}

function execBuildPlan(
  _npc: NPC,
  buildingId: string,
  x: number,
  y: number,
  rotation: number,
  orientation: string | undefined,
  world: GameWorldNPCInterface,
): ActionResult {
  // Prevent placing more holograms when uncompleted ones already exist
  if (world.hasUncompletedHolograms()) {
    const loc = world.getHologramLocation();
    return {
      success: false,
      reason: `Uncompleted hologram exists${loc ? ` at (${loc.x},${loc.y})` : ""}! Use <construct x="${loc?.x ?? 0}" y="${loc?.y ?? 0}"/> to build it.`,
    };
  }
  const placed = world.npcPlaceBuilding(buildingId, x, y, rotation, orientation);
  if (!placed) return { success: false, reason: "Cannot place building there" };
  return { success: true };
}

function execEquip(npc: NPC, bagIndex: number): ActionResult {
  if (bagIndex < 0 || bagIndex >= npc.inventory.bag.length) {
    return { success: false, reason: "Invalid bag index" };
  }
  const item = npc.inventory.bag[bagIndex];
  if (!item?.slot) return { success: false, reason: "Item is not equippable" };

  equipItem(npc.inventory, bagIndex);
  npc.refreshSprite();
  return { success: true };
}

function execUnequip(npc: NPC, slot: string): ActionResult {
  const validSlot = slot as (typeof EquipmentSlot)[keyof typeof EquipmentSlot];
  const item = npc.inventory.equipment[validSlot];
  if (!item) return { success: false, reason: "Nothing equipped in that slot" };

  unequipItem(npc.inventory, validSlot);
  npc.refreshSprite();
  return { success: true };
}

function execConsume(npc: NPC, bagIndex: number): ActionResult {
  if (bagIndex < 0 || bagIndex >= npc.inventory.bag.length) {
    return { success: false, reason: "Invalid bag index" };
  }
  const result = consumeItem(npc.inventory, bagIndex, npc.vitals);
  if (!result) return { success: false, reason: "Item is not consumable" };
  npc.vitals = result;
  return { success: true };
}

function execDropItem(npc: NPC, bagIndex: number, world: GameWorldNPCInterface): ActionResult {
  if (bagIndex < 0 || bagIndex >= npc.inventory.bag.length) {
    return { success: false, reason: "Invalid bag index" };
  }
  const item = npc.inventory.bag.splice(bagIndex, 1)[0];
  world.npcDropItem(npc, item, npc.tileX, npc.tileY);
  return { success: true };
}

function execToggleDoor(
  npc: NPC,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "open_door" }, world);
    if (result === "queued") return { success: true, reason: "Walking to door" };
    if (result === null) return { success: false, reason: "Cannot reach door" };
  }
  // Auto-find adjacent door
  for (const dir of CARDINAL_DIRS) {
    const fx = npc.tileX + DIR_DX[dir];
    const fy = npc.tileY + DIR_DY[dir];
    const edge = world.getEdgeBetween(npc.tileX, npc.tileY, fx, fy);
    if (edge && edge.type.interactable && edge.state === "complete") {
      npc.face(dir);
      world.npcToggleDoor(edge);
      return { success: true };
    }
    const building = world.getBuildingAt(fx, fy);
    if (building && building.type.interactable && building.state === "complete") {
      npc.face(dir);
      world.npcToggleTileDoor(building);
      return { success: true };
    }
  }
  return { success: false, reason: "No door nearby" };
}

function execClaimBed(
  npc: NPC,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    // Check if the target bed is already claimed BEFORE walking there
    if (world.isBedClaimed(x, y)) {
      return {
        success: false,
        reason: `Bed at (${x},${y}) is already claimed! Build your own bedroll (1 cow_hide + 1 wool) instead.`,
      };
    }
    const result = walkToTargetOrAct(npc, x, y, { action: "claim_bed" }, world);
    if (result === "queued") return { success: true, reason: "Walking to bed" };
    if (result === null) return { success: false, reason: "Cannot reach bed" };
  }
  // Auto-find adjacent bed
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (bx, by) => {
    const b = world.getBuildingAt(bx, by);
    return (
      b != null &&
      (b.type.id === "bed" || b.type.id === "bedroll") &&
      b.state === "complete" &&
      !world.isBedClaimed(bx, by)
    );
  });
  if (!dir) return { success: false, reason: "No unclaimed bed nearby" };
  npc.face(dir);
  const facing = npc.getFacingTile();
  const ok = world.claimBed(npc, facing.x, facing.y);
  if (!ok) return { success: false, reason: "Could not claim" };
  npc.claimedBed = { x: facing.x, y: facing.y };
  return { success: true, reason: `Claimed at (${facing.x},${facing.y})` };
}

function execSleep(npc: NPC, world: GameWorldNPCInterface, x?: number, y?: number): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "sleep" }, world);
    if (result === "queued") return { success: true, reason: "Walking to bed" };
    if (result === null) return { success: false, reason: "Cannot reach bed" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (bx, by) => {
    const b = world.getBuildingAt(bx, by);
    if (!b || (b.type.id !== "bed" && b.type.id !== "bedroll") || b.state !== "complete")
      return false;
    if (
      world.isBedClaimed(bx, by) &&
      (!npc.claimedBed || npc.claimedBed.x !== bx || npc.claimedBed.y !== by)
    )
      return false;
    return true;
  });
  if (!dir) return { success: false, reason: "No usable bed nearby" };
  npc.face(dir);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y)!;
  npc.sleepEnergyRate = building.type.id === "bedroll" ? 3 : 5;
  npc.enterSleep();
  return { success: true };
}

function execWakeUp(npc: NPC): ActionResult {
  if (!npc.sleeping) return { success: false, reason: "Not sleeping" };
  npc.exitSleep();
  return { success: true };
}

function execStoreItem(
  npc: NPC,
  bagIndex: number,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "store_item", bagIndex }, world);
    if (result === "queued") return { success: true, reason: "Walking to storage" };
    if (result === null) return { success: false, reason: "Cannot reach storage" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (sx, sy) => {
    const b = world.getBuildingAt(sx, sy);
    return b != null && b.type.storage != null && b.state === "complete";
  });
  if (!dir) return { success: false, reason: "No storage nearby" };
  npc.face(dir);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y);
  if (!building?.storageSlots) return { success: false, reason: "No storage" };
  if (bagIndex < 0 || bagIndex >= npc.inventory.bag.length)
    return { success: false, reason: "Invalid bag index" };
  const emptyIdx = building.storageSlots.indexOf(null);
  if (emptyIdx === -1) return { success: false, reason: "Storage full" };
  building.storageSlots[emptyIdx] = npc.inventory.bag.splice(bagIndex, 1)[0];
  return { success: true };
}

function execRetrieveItem(
  npc: NPC,
  slotIndex: number,
  world: GameWorldNPCInterface,
  x?: number,
  y?: number,
): ActionResult {
  if (x != null && y != null) {
    const result = walkToTargetOrAct(npc, x, y, { action: "retrieve_item", slotIndex }, world);
    if (result === "queued") return { success: true, reason: "Walking to storage" };
    if (result === null) return { success: false, reason: "Cannot reach storage" };
  }
  const dir = findAdjacentDir(npc.tileX, npc.tileY, (sx, sy) => {
    const b = world.getBuildingAt(sx, sy);
    return b != null && b.type.storage != null && b.state === "complete";
  });
  if (!dir) return { success: false, reason: "No storage nearby" };
  npc.face(dir);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y);
  if (!building?.storageSlots) return { success: false, reason: "No storage" };
  if (slotIndex < 0 || slotIndex >= building.storageSlots.length)
    return { success: false, reason: "Invalid slot" };
  const item = building.storageSlots[slotIndex];
  if (!item) return { success: false, reason: "Slot empty" };
  building.storageSlots[slotIndex] = null;
  addItemToBag(npc.inventory, item);
  return { success: true };
}

function execChat(
  npc: NPC,
  text: string,
  world: GameWorldNPCInterface,
  target?: string,
): ActionResult {
  // If a target is specified, use distance to that target; otherwise nearest listener
  const dist = target
    ? world.getDistanceToNamed(npc, target)
    : world.getNearestListenerDistance(npc);

  if (target && dist === Infinity) {
    return { success: false, reason: `Can't find "${target}" — they may not be nearby` };
  }
  if (target && dist > 10) {
    return {
      success: false,
      reason: `"${target}" is ${dist} tiles away — too far to reach even by yelling (max 10). Move closer first.`,
    };
  }

  let mode: ChatMode;
  if (dist <= 1) {
    mode = "whisper";
  } else if (dist <= 5) {
    mode = "talk";
  } else {
    mode = "yell";
  }
  world.npcChat(npc, text, mode);
  return { success: true };
}

function execRemember(npc: NPC, note: string): ActionResult {
  const added = addNote(npc.memory, note);
  if (!added) return { success: false, reason: "Memory is full (max 20 notes)" };
  return { success: true };
}

function execForget(npc: NPC, noteIndex: number): ActionResult {
  const removed = removeNote(npc.memory, noteIndex);
  if (!removed) return { success: false, reason: "Invalid note index" };
  return { success: true };
}

function execWait(npc: NPC, durationMs: number): ActionResult {
  npc.startWaiting(durationMs);
  return { success: true };
}
