import { EquipmentSlot, Rarity, type Item } from "../types/item.ts";

export const ITEMS: Record<string, Item> = {
  starter_tunic: {
    id: "starter_tunic",
    name: "Simple Tunic",
    description: "A plain cloth tunic. It keeps you warm.",
    rarity: Rarity.Common,
    stats: {},
    weight: 2,
    slot: EquipmentSlot.Torso,
  },
  starter_pants: {
    id: "starter_pants",
    name: "Simple Pants",
    description: "Basic cloth pants. Nothing fancy.",
    rarity: Rarity.Common,
    stats: {},
    weight: 2,
    slot: EquipmentSlot.Legs,
  },
  starter_boots: {
    id: "starter_boots",
    name: "Simple Boots",
    description: "Worn leather boots. They get the job done.",
    rarity: Rarity.Common,
    stats: {},
    weight: 1,
    slot: EquipmentSlot.Feet,
  },
};

export function createStarterItem(baseId: string, colorIndex: number): Item {
  const base = ITEMS[baseId];
  return { ...base, colorIndex };
}
