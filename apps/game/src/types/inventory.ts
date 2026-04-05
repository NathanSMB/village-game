import type { CharacterAppearance } from "./character.ts";
import { EquipmentSlot, type Item, getItemQuantity, isStackable } from "./item.ts";
import type { VitalsState } from "./vitals.ts";
import { clampVital } from "./vitals.ts";
import { createStarterItem, DURABILITY_CONFIG, ITEMS } from "../data/items.ts";

export type Equipment = Record<EquipmentSlot, Item | null>;

export interface InventoryState {
  equipment: Equipment;
  bag: Item[];
  maxWeight: number;
}

export function emptyEquipment(): Equipment {
  return {
    [EquipmentSlot.Head]: null,
    [EquipmentSlot.Torso]: null,
    [EquipmentSlot.Hands]: null,
    [EquipmentSlot.Legs]: null,
    [EquipmentSlot.Feet]: null,
    [EquipmentSlot.MainHand]: null,
    [EquipmentSlot.OffHand]: null,
  };
}

export function defaultInventory(appearance: CharacterAppearance): InventoryState {
  const equipment = emptyEquipment();
  equipment[EquipmentSlot.Torso] = createStarterItem(
    "starter_tunic",
    appearance.equipmentColors.torso,
  );
  equipment[EquipmentSlot.Legs] = createStarterItem(
    "starter_pants",
    appearance.equipmentColors.legs,
  );
  equipment[EquipmentSlot.Feet] = createStarterItem(
    "starter_boots",
    appearance.equipmentColors.feet,
  );
  return { equipment, bag: [], maxWeight: 50 };
}

export function totalWeight(state: InventoryState): number {
  let weight = 0;
  for (const item of Object.values(state.equipment)) {
    if (item) weight += item.weight * getItemQuantity(item);
  }
  for (const item of state.bag) {
    weight += item.weight * getItemQuantity(item);
  }
  return weight;
}

/**
 * Add an item to the inventory bag, merging into existing stacks for stackable items.
 */
export function addItemToBag(state: InventoryState, item: Item): void {
  if (isStackable(item)) {
    const incoming = getItemQuantity(item);
    const existing = state.bag.find(
      (b) => b.id === item.id && isStackable(b) && getItemQuantity(b) < (b.maxStack ?? Infinity),
    );
    if (existing) {
      const space = (existing.maxStack ?? Infinity) - getItemQuantity(existing);
      const transfer = Math.min(incoming, space);
      existing.quantity = getItemQuantity(existing) + transfer;
      const remaining = incoming - transfer;
      if (remaining > 0) {
        state.bag.push({ ...item, quantity: remaining });
      }
      return;
    }
  }
  state.bag.push(item);
}

export function equipItem(state: InventoryState, bagIndex: number): void {
  const item = state.bag[bagIndex];
  if (!item || !item.slot) return;
  const current = state.equipment[item.slot];
  state.equipment[item.slot] = item;
  state.bag.splice(bagIndex, 1);
  if (current) {
    addItemToBag(state, current);
  }
}

export function consumeItem(
  state: InventoryState,
  bagIndex: number,
  vitals: VitalsState,
): VitalsState | null {
  const item = state.bag[bagIndex];
  if (!item?.consumable) return null;

  const effect = item.consumable;
  const newVitals = { ...vitals };

  if (effect.hungerRestore) {
    newVitals.hunger = clampVital(newVitals.hunger + effect.hungerRestore);
  }
  if (effect.thirstRestore) {
    newVitals.thirst = clampVital(newVitals.thirst + effect.thirstRestore);
  }
  if (effect.healthRestore) {
    newVitals.health = clampVital(newVitals.health + effect.healthRestore);
  }

  state.bag.splice(bagIndex, 1);
  return newVitals;
}

export function unequipItem(state: InventoryState, slot: EquipmentSlot): void {
  const item = state.equipment[slot];
  if (!item) return;
  state.equipment[slot] = null;
  addItemToBag(state, item);
}

/**
 * Consume one arrow from the equipped OffHand slot.
 * Returns true if an arrow was consumed, false if no arrows available.
 */
export function consumeArrow(state: InventoryState): boolean {
  const offHand = state.equipment[EquipmentSlot.OffHand];
  if (!offHand || offHand.id !== "arrow") return false;
  const qty = getItemQuantity(offHand);
  if (qty <= 1) {
    state.equipment[EquipmentSlot.OffHand] = null;
  } else {
    offHand.quantity = qty - 1;
  }
  return true;
}

/**
 * Attempt to repair an equipped item using materials from the bag.
 * Returns the name of the consumed repair material, or null if repair is not possible.
 */
export function repairItem(state: InventoryState, slot: EquipmentSlot): string | null {
  const item = state.equipment[slot];
  if (!item || item.durability == null || item.maxDurability == null) return null;
  if (item.durability >= item.maxDurability) return null;

  const config = DURABILITY_CONFIG[item.id];
  if (!config) return null;

  // Find and consume one repair material from the bag
  const repairIdx = state.bag.findIndex((b) => b.id === config.repairItemId);
  if (repairIdx === -1) return null;

  state.bag.splice(repairIdx, 1);
  item.durability = item.maxDurability;

  return ITEMS[config.repairItemId]?.name ?? config.repairItemId;
}
