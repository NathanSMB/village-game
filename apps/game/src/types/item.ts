export const Rarity = {
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  Epic: "Epic",
  Legendary: "Legendary",
} as const;

export type Rarity = (typeof Rarity)[keyof typeof Rarity];

export const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.Common]: "#ffffff",
  [Rarity.Uncommon]: "#40c040",
  [Rarity.Rare]: "#4080f0",
  [Rarity.Epic]: "#a040f0",
  [Rarity.Legendary]: "#f0c040",
};

export const EquipmentSlot = {
  Head: "head",
  Torso: "torso",
  Hands: "hands",
  Legs: "legs",
  Feet: "feet",
  MainHand: "mainHand",
  OffHand: "offHand",
} as const;

export type EquipmentSlot = (typeof EquipmentSlot)[keyof typeof EquipmentSlot];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  [EquipmentSlot.Head]: "Head",
  [EquipmentSlot.Torso]: "Torso",
  [EquipmentSlot.Hands]: "Hands",
  [EquipmentSlot.Legs]: "Legs",
  [EquipmentSlot.Feet]: "Feet",
  [EquipmentSlot.MainHand]: "Main Hand",
  [EquipmentSlot.OffHand]: "Off Hand",
};

export const ALL_EQUIPMENT_SLOTS: EquipmentSlot[] = [
  EquipmentSlot.Head,
  EquipmentSlot.Torso,
  EquipmentSlot.Hands,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
  EquipmentSlot.MainHand,
  EquipmentSlot.OffHand,
];

export interface ItemStats {
  attack?: number;
  defense?: number;
  speed?: number;
}

export interface ConsumableEffect {
  hungerRestore?: number;
  thirstRestore?: number;
  healthRestore?: number;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  stats: ItemStats;
  weight: number;
  slot?: EquipmentSlot;
  colorIndex?: number;
  consumable?: ConsumableEffect;
  /** Dye color name shown in the inventory description (e.g. "White", "Crimson"). */
  dye?: string;
  /** Sprite identifier for the 16×16 ground/inventory icon (e.g. "small-rock", "berry") */
  itemSprite?: string;
  /** Tool effectiveness multipliers against entity categories (e.g. "mineable", "tree"). */
  toolMultipliers?: Partial<Record<string, number>>;
  /** Current durability of the item (per-instance, only on equipment). */
  durability?: number;
  /** Maximum durability this item can have. */
  maxDurability?: number;
}

export function isConsumable(item: Item): boolean {
  return item.consumable != null;
}

export function isEquipment(item: Item): boolean {
  return item.slot != null && item.consumable == null;
}

export function hasDurability(item: Item): boolean {
  return item.maxDurability != null && item.maxDurability > 0;
}
