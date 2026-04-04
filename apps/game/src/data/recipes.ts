import type { Recipe } from "../types/crafting.ts";

export const RECIPES: Recipe[] = [
  {
    id: "hammer",
    name: "Hammer",
    ingredients: [
      { itemId: "small_rock", count: 1 },
      { itemId: "branch", count: 1 },
    ],
    resultId: "hammer",
  },
  {
    id: "hatchet",
    name: "Hatchet",
    ingredients: [
      { itemId: "small_rock", count: 2 },
      { itemId: "branch", count: 1 },
    ],
    resultId: "hatchet",
  },
  {
    id: "pickaxe",
    name: "Pickaxe",
    ingredients: [
      { itemId: "small_rock", count: 2 },
      { itemId: "branch", count: 1 },
    ],
    resultId: "pickaxe",
  },
  {
    id: "spear",
    name: "Spear",
    ingredients: [
      { itemId: "small_rock", count: 2 },
      { itemId: "branch", count: 2 },
    ],
    resultId: "spear",
  },
];
