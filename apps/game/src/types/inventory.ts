import type { CharacterAppearance } from "./character.ts";
import { EquipmentSlot, type Item } from "./item.ts";
import { createStarterItem } from "../data/items.ts";

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
    if (item) weight += item.weight;
  }
  for (const item of state.bag) {
    weight += item.weight;
  }
  return weight;
}

export function equipItem(state: InventoryState, bagIndex: number): void {
  const item = state.bag[bagIndex];
  if (!item) return;
  const current = state.equipment[item.slot];
  state.equipment[item.slot] = item;
  state.bag.splice(bagIndex, 1);
  if (current) {
    state.bag.push(current);
  }
}

export function unequipItem(state: InventoryState, slot: EquipmentSlot): void {
  const item = state.equipment[slot];
  if (!item) return;
  state.equipment[slot] = null;
  state.bag.push(item);
}
