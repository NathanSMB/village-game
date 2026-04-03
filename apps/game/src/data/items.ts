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
    itemSprite: "tunic",
  },
  starter_pants: {
    id: "starter_pants",
    name: "Simple Pants",
    description: "Basic cloth pants. Nothing fancy.",
    rarity: Rarity.Common,
    stats: {},
    weight: 2,
    slot: EquipmentSlot.Legs,
    itemSprite: "pants",
  },
  starter_boots: {
    id: "starter_boots",
    name: "Simple Boots",
    description: "Worn leather boots. They get the job done.",
    rarity: Rarity.Common,
    stats: {},
    weight: 1,
    slot: EquipmentSlot.Feet,
    itemSprite: "boots",
  },
  berry: {
    id: "berry",
    name: "Berry",
    description: "A plump red berry. Restores a little hunger.",
    rarity: Rarity.Common,
    stats: {},
    weight: 0.5,
    consumable: { hungerRestore: 10 },
    itemSprite: "berry",
  },
  small_rock: {
    id: "small_rock",
    name: "Small Rock",
    description: "A smooth stone. Could be useful for crafting.",
    rarity: Rarity.Common,
    stats: {},
    weight: 1,
    itemSprite: "small-rock",
  },
  branch: {
    id: "branch",
    name: "Branch",
    description: "A sturdy wooden branch. Useful for building or kindling.",
    rarity: Rarity.Common,
    stats: {},
    weight: 1,
    itemSprite: "branch",
  },
};

export function createStarterItem(baseId: string, colorIndex: number): Item {
  const base = ITEMS[baseId];
  return { ...base, colorIndex };
}
