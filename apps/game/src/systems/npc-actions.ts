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
import { addItemToBag, equipItem, unequipItem, consumeItem } from "../types/inventory.ts";
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
  switch (action.action) {
    case "plan":
      // Handled by GameWorld — routed to thinking model
      return { success: true, reason: "Planning..." };

    case "complete_todo":
      return execCompleteTodo(npc, action.todoIndex);

    case "think":
      // Handled specially by GameWorld — not executed here
      return { success: true, reason: "Thinking..." };

    case "move_to":
      return execMoveTo(npc, action.x, action.y, world);

    case "pick_bush":
      return execPickBush(npc, action.direction, world);

    case "chop_tree":
      return execChopTree(npc, action.direction, world);

    case "mine_rock":
      return execMineRock(npc, action.direction, world);

    case "drink_water":
      return execDrinkWater(npc, action.direction, world);

    case "pick_up_item":
      return execPickUpItem(npc, action.direction, world);

    case "attack":
      return execAttack(npc, action.direction, world);

    case "craft":
      return execCraft(npc, action.recipeId);

    case "cook":
      return execCook(npc, action.direction, action.inputItemId, world);

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
      return execToggleDoor(npc, action.direction, world);

    case "claim_bed":
      return execClaimBed(npc, action.direction, world);

    case "sleep":
      return execSleep(npc, action.direction, world);

    case "wake_up":
      return execWakeUp(npc);

    case "store_item":
      return execStoreItem(npc, action.direction, action.bagIndex, world);

    case "retrieve_item":
      return execRetrieveItem(npc, action.direction, action.slotIndex, world);

    case "chat":
      return execChat(npc, action.text, action.mode, world);

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

function execCompleteTodo(npc: NPC, todoIndex: number): ActionResult {
  if (todoIndex < 0 || todoIndex >= npc.todoList.length) {
    return { success: false, reason: "Invalid todo index" };
  }
  const item = npc.todoList[todoIndex];
  if (item.done) {
    return { success: false, reason: "Already completed" };
  }
  item.done = true;

  // Check if all todos are done — if so, clear the list so the NPC will plan again
  const allDone = npc.todoList.every((t) => t.done);
  if (allDone) {
    npc.todoList = [];
  }

  return { success: true, reason: `Done: ${item.task}${allDone ? " (plan complete!)" : ""}` };
}

function execMoveTo(npc: NPC, x: number, y: number, world: GameWorldNPCInterface): ActionResult {
  const dirs = world.findPathDirections(npc.tileX, npc.tileY, x, y);
  if (!dirs || dirs.length === 0) {
    return { success: false, reason: "No path found" };
  }
  // Store remaining path on the NPC, pop first step now
  npc.pendingPath = dirs.slice(1);
  const moved = npc.moveToTile(dirs[0]);
  if (!moved) {
    npc.pendingPath = [];
    return { success: false, reason: "First step blocked" };
  }
  return { success: true };
}

function execPickBush(npc: NPC, direction: Direction, world: GameWorldNPCInterface): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const bush = world.getBushAt(facing.x, facing.y);
  if (!bush || !bush.canPick()) {
    return { success: false, reason: "No bush with berries" };
  }

  npc.startPicking();

  // Schedule the actual pick after animation
  setTimeout(() => {
    const berry = bush.pick();
    if (berry) {
      addItemToBag(npc.inventory, berry);
    }
  }, PICK_DELAY);

  return { success: true };
}

function execChopTree(npc: NPC, direction: Direction, world: GameWorldNPCInterface): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const tree = world.getTreeAt(facing.x, facing.y);
  if (!tree || tree.isChoppedDown()) {
    return { success: false, reason: "No tree to chop" };
  }

  npc.startAttack();

  // Apply damage after a short delay
  setTimeout(() => {
    const mainHand = npc.inventory.equipment[EquipmentSlot.MainHand];
    const canonical = mainHand ? ITEMS[mainHand.id] : null;
    const baseDamage = canonical ? (canonical.stats.attack ?? 0) : UNARMED_DAMAGE;
    const mult = canonical?.toolMultipliers?.tree ?? 1;
    const damage = baseDamage * mult;
    const result = tree.takeDamage(damage);
    for (const drop of result.drops) {
      world.dropResourceNear(tree.tileX, tree.tileY, drop);
    }
    // Degrade weapon
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

function execMineRock(npc: NPC, direction: Direction, world: GameWorldNPCInterface): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const rock = world.getRockAt(facing.x, facing.y);
  if (!rock) {
    return { success: false, reason: "No rock to mine" };
  }

  npc.startAttack();

  setTimeout(() => {
    const mainHand = npc.inventory.equipment[EquipmentSlot.MainHand];
    const canonical = mainHand ? ITEMS[mainHand.id] : null;
    const baseDamage = canonical ? (canonical.stats.attack ?? 0) : UNARMED_DAMAGE;
    const mult = canonical?.toolMultipliers?.mineable ?? 1;
    const damage = baseDamage * mult;
    const drops = rock.takeDamage(damage);
    for (const drop of drops) {
      world.dropResourceNear(rock.tileX, rock.tileY, drop);
    }
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
  direction: Direction,
  world: GameWorldNPCInterface,
): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  if (!world.isWaterTile(facing.x, facing.y)) {
    return { success: false, reason: "No water there" };
  }

  npc.startDrinking();
  // Thirst restore is handled inside NPC.onPreUpdate when drink animation completes
  return { success: true };
}

function execPickUpItem(
  npc: NPC,
  direction: Direction,
  world: GameWorldNPCInterface,
): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const stack = world.getGroundItemsAt(facing.x, facing.y);
  if (!stack || stack.isEmpty()) {
    return { success: false, reason: "No items on the ground" };
  }

  npc.startPickingUpItem();

  setTimeout(() => {
    const item = stack.removeItem(0);
    if (item) {
      addItemToBag(npc.inventory, item);
    }
  }, PICKUP_DELAY);

  return { success: true };
}

function execAttack(npc: NPC, direction: Direction, world: GameWorldNPCInterface): ActionResult {
  npc.face(direction);
  npc.startAttack();

  // Apply damage after animation delay (same timing as player)
  const facing = npc.getFacingTile();
  setTimeout(() => {
    world.npcAttackAt(npc, facing.x, facing.y);
  }, 200);

  return { success: true };
}

function execCraft(npc: NPC, recipeId: string): ActionResult {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { success: false, reason: "Unknown recipe" };
  if (!canCraft(npc.inventory, recipe)) {
    return { success: false, reason: "Missing materials" };
  }
  craft(npc.inventory, recipe);
  npc.refreshSprite();
  return { success: true };
}

function execCook(
  npc: NPC,
  direction: Direction,
  inputItemId: string,
  world: GameWorldNPCInterface,
): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y);
  if (!building || !building.isBurning) {
    return { success: false, reason: "No burning fire nearby" };
  }

  const recipe = COOKING_RECIPE_MAP[inputItemId];
  if (!recipe) return { success: false, reason: "Cannot cook that item" };

  const bagIdx = npc.inventory.bag.findIndex((item) => item.id === inputItemId);
  if (bagIdx === -1) return { success: false, reason: "Item not in inventory" };

  npc.inventory.bag.splice(bagIdx, 1);
  const cookedItem = ITEMS[recipe.outputId];
  if (cookedItem) {
    addItemToBag(npc.inventory, createItemCopy(recipe.outputId));
  }

  return { success: true };
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
  direction: Direction,
  world: GameWorldNPCInterface,
): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();

  // Try edge building first (wall doors)
  const edge = world.getEdgeBetween(npc.tileX, npc.tileY, facing.x, facing.y);
  if (edge && edge.type.interactable && edge.state === "complete") {
    world.npcToggleDoor(edge);
    return { success: true };
  }

  // Try tile building (interactable building on tile)
  const building = world.getBuildingAt(facing.x, facing.y);
  if (building && building.type.interactable && building.state === "complete") {
    world.npcToggleTileDoor(building);
    return { success: true };
  }

  return { success: false, reason: "No door to toggle" };
}

function execClaimBed(npc: NPC, direction: Direction, world: GameWorldNPCInterface): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y);
  const isBedType = building && (building.type.id === "bed" || building.type.id === "bedroll");
  if (!isBedType || building.state !== "complete") {
    return { success: false, reason: "No bed or bedroll there" };
  }
  if (world.isBedClaimed(facing.x, facing.y)) {
    return { success: false, reason: "Already claimed by someone" };
  }
  const ok = world.claimBed(npc, facing.x, facing.y);
  if (!ok) return { success: false, reason: "Could not claim" };
  npc.claimedBed = { x: facing.x, y: facing.y };
  return { success: true, reason: `Claimed at (${facing.x},${facing.y})` };
}

function execSleep(npc: NPC, direction: Direction, world: GameWorldNPCInterface): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y);
  const isBedType = building && (building.type.id === "bed" || building.type.id === "bedroll");
  if (!isBedType || building.state !== "complete") {
    return { success: false, reason: "No bed or bedroll there" };
  }
  // Can only sleep in your own claimed bed
  if (
    world.isBedClaimed(facing.x, facing.y) &&
    (!npc.claimedBed || npc.claimedBed.x !== facing.x || npc.claimedBed.y !== facing.y)
  ) {
    return { success: false, reason: "This bed belongs to someone else" };
  }
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
  direction: Direction,
  bagIndex: number,
  world: GameWorldNPCInterface,
): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y);
  if (!building || !building.type.storage || building.state !== "complete") {
    return { success: false, reason: "No storage there" };
  }
  if (bagIndex < 0 || bagIndex >= npc.inventory.bag.length) {
    return { success: false, reason: "Invalid bag index" };
  }
  const slots = building.storageSlots;
  if (!slots) return { success: false, reason: "No storage slots" };

  const emptyIdx = slots.indexOf(null);
  if (emptyIdx === -1) return { success: false, reason: "Storage is full" };

  const item = npc.inventory.bag.splice(bagIndex, 1)[0];
  slots[emptyIdx] = item;
  return { success: true };
}

function execRetrieveItem(
  npc: NPC,
  direction: Direction,
  slotIndex: number,
  world: GameWorldNPCInterface,
): ActionResult {
  npc.face(direction);
  const facing = npc.getFacingTile();
  const building = world.getBuildingAt(facing.x, facing.y);
  if (!building || !building.type.storage || building.state !== "complete") {
    return { success: false, reason: "No storage there" };
  }
  const slots = building.storageSlots;
  if (!slots) return { success: false, reason: "No storage slots" };
  if (slotIndex < 0 || slotIndex >= slots.length) {
    return { success: false, reason: "Invalid slot index" };
  }
  const item = slots[slotIndex];
  if (!item) return { success: false, reason: "Slot is empty" };

  slots[slotIndex] = null;
  addItemToBag(npc.inventory, item);
  return { success: true };
}

function execChat(
  npc: NPC,
  text: string,
  mode: ChatMode,
  world: GameWorldNPCInterface,
): ActionResult {
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
