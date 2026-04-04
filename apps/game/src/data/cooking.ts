export interface CookingRecipe {
  /** Item ID consumed as input. */
  inputId: string;
  /** Item ID produced as output. */
  outputId: string;
}

export const COOKING_RECIPES: CookingRecipe[] = [
  { inputId: "mutton", outputId: "cooked_mutton" },
  { inputId: "raw_beef", outputId: "cooked_beef" },
];

/** Lookup: inputId → recipe (for quick checks during cooking menu). */
export const COOKING_RECIPE_MAP: Record<string, CookingRecipe> = Object.fromEntries(
  COOKING_RECIPES.map((r) => [r.inputId, r]),
);
