export interface BuildingIngredient {
  itemId: string;
  count: number;
}

export interface FireConfig {
  /** Duration in ms the fire burns once ignited. */
  burnDurationMs: number;
  /** If true, fire starts automatically when construction completes. */
  autoIgnite: boolean;
  /** If true, the building is removed entirely when the fire expires. */
  removeOnBurnout: boolean;
  /** Items consumed from player inventory to ignite (empty array for autoIgnite buildings). */
  fuelCost: BuildingIngredient[];
}

export interface StorageConfig {
  /** Number of item slots in the container. */
  slotCount: number;
}

export interface BuildingType {
  id: string;
  name: string;
  ingredients: BuildingIngredient[];
  maxHp: number;
  /** Blocks player movement when complete. */
  solid: boolean;
  /** Responds to the action key (doors/gates). */
  interactable: boolean;
  /** For doors/gates: blocks movement when closed. Ignored if interactable is false. */
  solidWhenClosed: boolean;
  /** How this building is placed: "tile" occupies a full tile, "edge" sits on the boundary between two tiles. */
  placement: "tile" | "edge";
  /** If true, this building can only be placed on a completed indoor floor tile (which it replaces). */
  requiresIndoor?: boolean;
  /** If true, this building can be placed on a completed indoor floor tile in addition to normal outdoor tiles. */
  allowIndoor?: boolean;
  /** If set, this building supports fire behavior (burn timer, ignition, cooking). */
  fire?: FireConfig;
  /** If set, this building acts as an item container with fixed slots. */
  storage?: StorageConfig;
}

export const BUILDING_TYPES: BuildingType[] = [
  {
    id: "wall",
    name: "Wall",
    ingredients: [{ itemId: "log", count: 2 }],
    maxHp: 100,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "edge",
  },
  {
    id: "wall_window",
    name: "Wall (Window)",
    ingredients: [{ itemId: "log", count: 1 }],
    maxHp: 80,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "edge",
  },
  {
    id: "wall_door",
    name: "Wall (Door)",
    ingredients: [{ itemId: "log", count: 2 }],
    maxHp: 100,
    solid: false,
    interactable: true,
    solidWhenClosed: true,
    placement: "edge",
  },
  {
    id: "floor",
    name: "Floor",
    ingredients: [{ itemId: "log", count: 1 }],
    maxHp: 60,
    solid: false,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
  },
  {
    id: "fence",
    name: "Fence",
    ingredients: [{ itemId: "branch", count: 2 }],
    maxHp: 60,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "edge",
  },
  {
    id: "fence_gate",
    name: "Fence Gate",
    ingredients: [{ itemId: "branch", count: 2 }],
    maxHp: 60,
    solid: false,
    interactable: true,
    solidWhenClosed: true,
    placement: "edge",
  },
  {
    id: "bed",
    name: "Bed",
    ingredients: [
      { itemId: "log", count: 2 },
      { itemId: "wool", count: 3 },
    ],
    maxHp: 80,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    requiresIndoor: true,
  },
  {
    id: "camp_fire",
    name: "Camp Fire",
    ingredients: [
      { itemId: "branch", count: 5 },
      { itemId: "flint", count: 1 },
    ],
    maxHp: 30,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    fire: {
      burnDurationMs: 60_000,
      autoIgnite: true,
      removeOnBurnout: true,
      fuelCost: [],
    },
  },
  {
    id: "fire_pit",
    name: "Fire Pit",
    ingredients: [{ itemId: "small_rock", count: 5 }],
    maxHp: 60,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    fire: {
      burnDurationMs: 180_000,
      autoIgnite: false,
      removeOnBurnout: false,
      fuelCost: [
        { itemId: "log", count: 1 },
        { itemId: "flint", count: 1 },
      ],
    },
  },
  {
    id: "hearth",
    name: "Hearth",
    ingredients: [{ itemId: "large_stone", count: 5 }],
    maxHp: 100,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    requiresIndoor: true,
    fire: {
      burnDurationMs: 300_000,
      autoIgnite: false,
      removeOnBurnout: false,
      fuelCost: [
        { itemId: "log", count: 1 },
        { itemId: "flint", count: 1 },
      ],
    },
  },
  {
    id: "box_short",
    name: "Short Box",
    ingredients: [{ itemId: "log", count: 2 }],
    maxHp: 40,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    allowIndoor: true,
    storage: { slotCount: 8 },
  },
  {
    id: "box_medium",
    name: "Medium Box",
    ingredients: [{ itemId: "log", count: 4 }],
    maxHp: 60,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    allowIndoor: true,
    storage: { slotCount: 12 },
  },
  {
    id: "box_tall",
    name: "Tall Box",
    ingredients: [{ itemId: "log", count: 8 }],
    maxHp: 80,
    solid: true,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    allowIndoor: true,
    storage: { slotCount: 16 },
  },
  {
    id: "bedroll",
    name: "Bedroll",
    ingredients: [
      { itemId: "cow_hide", count: 1 },
      { itemId: "wool", count: 1 },
    ],
    maxHp: 40,
    solid: false,
    interactable: false,
    solidWhenClosed: false,
    placement: "tile",
    // No requiresIndoor — bedrolls can be placed anywhere outdoors or indoors
    allowIndoor: true,
  },
];

export const BUILDING_TYPE_MAP: Record<string, BuildingType> = Object.fromEntries(
  BUILDING_TYPES.map((bt) => [bt.id, bt]),
);

/**
 * Flatten ingredients into an ordered list of individual item IDs.
 * e.g. [{itemId:"log",count:2}] -> ["log","log"]
 */
export function flattenIngredients(type: BuildingType): string[] {
  const list: string[] = [];
  for (const ing of type.ingredients) {
    for (let i = 0; i < ing.count; i++) {
      list.push(ing.itemId);
    }
  }
  return list;
}

/** Total number of individual materials required. */
export function totalMaterials(type: BuildingType): number {
  let total = 0;
  for (const ing of type.ingredients) {
    total += ing.count;
  }
  return total;
}
