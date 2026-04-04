export interface BuildingIngredient {
  itemId: string;
  count: number;
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
