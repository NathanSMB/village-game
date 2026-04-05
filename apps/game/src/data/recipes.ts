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
  {
    id: "simple_tunic",
    name: "Simple Tunic",
    ingredients: [{ itemId: "wool", count: 3 }],
    resultId: "starter_tunic",
  },
  {
    id: "simple_pants",
    name: "Simple Pants",
    ingredients: [{ itemId: "wool", count: 3 }],
    resultId: "starter_pants",
  },
  {
    id: "simple_boots",
    name: "Simple Boots",
    ingredients: [{ itemId: "cow_hide", count: 1 }],
    resultId: "starter_boots",
  },
  {
    id: "bow",
    name: "Bow",
    ingredients: [
      { itemId: "branch", count: 1 },
      { itemId: "mutton", count: 1, alternatives: ["raw_beef"] },
    ],
    resultId: "bow",
  },
  {
    id: "arrow",
    name: "Arrows (5)",
    ingredients: [
      { itemId: "small_rock", count: 2 },
      { itemId: "branch", count: 1 },
    ],
    resultId: "arrow",
    resultQuantity: 5,
  },
];
