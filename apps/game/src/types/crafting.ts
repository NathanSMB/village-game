import type { InventoryState } from "./inventory.ts";
import { ITEMS, createItemCopy } from "../data/items.ts";
import { addItemToBag } from "./inventory.ts";

export interface RecipeIngredient {
  itemId: string;
  count: number;
  /** Alternative item IDs that also satisfy this ingredient (e.g. any raw meat). */
  alternatives?: string[];
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  resultId: string;
  /** How many items the recipe produces (defaults to 1). Used for stackable outputs like arrows. */
  resultQuantity?: number;
}

/**
 * Count how many of a given item ID (or its alternatives) exist in the inventory bag.
 */
function countInBag(bag: { id: string }[], itemId: string, alternatives?: string[]): number {
  const validIds = new Set([itemId, ...(alternatives ?? [])]);
  let count = 0;
  for (const item of bag) {
    if (validIds.has(item.id)) count++;
  }
  return count;
}

/**
 * Check whether the player has enough materials in their bag to craft a recipe.
 */
export function canCraft(inventory: InventoryState, recipe: Recipe): boolean {
  for (const ingredient of recipe.ingredients) {
    if (countInBag(inventory.bag, ingredient.itemId, ingredient.alternatives) < ingredient.count) {
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

  // Remove ingredients (greedy first-match, respecting alternatives)
  for (const ingredient of recipe.ingredients) {
    const validIds = new Set([ingredient.itemId, ...(ingredient.alternatives ?? [])]);
    let remaining = ingredient.count;
    for (let i = inventory.bag.length - 1; i >= 0 && remaining > 0; i--) {
      if (validIds.has(inventory.bag[i].id)) {
        inventory.bag.splice(i, 1);
        remaining--;
      }
    }
  }

  // Add result item (with durability stamped if applicable)
  const baseItem = ITEMS[recipe.resultId];
  if (baseItem) {
    const resultItem = createItemCopy(recipe.resultId);
    const qty = recipe.resultQuantity ?? 1;
    if (qty > 1 && resultItem.stackable) {
      resultItem.quantity = qty;
    }
    addItemToBag(inventory, resultItem);
  }

  return true;
}
