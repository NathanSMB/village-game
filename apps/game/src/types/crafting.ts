import type { InventoryState } from "./inventory.ts";
import { ITEMS } from "../data/items.ts";

export interface RecipeIngredient {
  itemId: string;
  count: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  resultId: string;
}

/**
 * Count how many of a given item ID exist in the inventory bag.
 */
function countInBag(bag: { id: string }[], itemId: string): number {
  let count = 0;
  for (const item of bag) {
    if (item.id === itemId) count++;
  }
  return count;
}

/**
 * Check whether the player has enough materials in their bag to craft a recipe.
 */
export function canCraft(inventory: InventoryState, recipe: Recipe): boolean {
  for (const ingredient of recipe.ingredients) {
    if (countInBag(inventory.bag, ingredient.itemId) < ingredient.count) {
      return false;
    }
  }
  return true;
}

/**
 * Craft a recipe: remove ingredients from the bag and add the result item.
 * Returns true on success, false if materials are insufficient.
 */
export function craft(inventory: InventoryState, recipe: Recipe): boolean {
  if (!canCraft(inventory, recipe)) return false;

  // Remove ingredients (greedy first-match)
  for (const ingredient of recipe.ingredients) {
    let remaining = ingredient.count;
    for (let i = inventory.bag.length - 1; i >= 0 && remaining > 0; i--) {
      if (inventory.bag[i].id === ingredient.itemId) {
        inventory.bag.splice(i, 1);
        remaining--;
      }
    }
  }

  // Add result item
  const baseItem = ITEMS[recipe.resultId];
  if (baseItem) {
    inventory.bag.push({ ...baseItem });
  }

  return true;
}
