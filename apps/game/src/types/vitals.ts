export interface VitalsState {
  health: number; // 0–100
  hunger: number; // 0–100 (100 = full, 0 = starving)
  thirst: number; // 0–100 (100 = full, 0 = dehydrated)
}

/** Milliseconds for a full bar (100) to reach 0. */
export const HUNGER_DEPLETION_MS = 8 * 60 * 1000; // 8 minutes
export const THIRST_DEPLETION_MS = 4 * 60 * 1000; // 4 minutes (2× faster)

/** Milliseconds for health to go from 100 → 0 when starving / dehydrated. */
export const STARVATION_DAMAGE_MS = 5 * 60 * 1000; // 5 minutes
export const DEHYDRATION_DAMAGE_MS = 3 * 60 * 1000; // 3 minutes

const HUNGER_DECAY_RATE = 100 / HUNGER_DEPLETION_MS;
const THIRST_DECAY_RATE = 100 / THIRST_DEPLETION_MS;
const STARVATION_DAMAGE_RATE = 100 / STARVATION_DAMAGE_MS;
const DEHYDRATION_DAMAGE_RATE = 100 / DEHYDRATION_DAMAGE_MS;

export function clampVital(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function defaultVitals(): VitalsState {
  return { health: 100, hunger: 100, thirst: 100 };
}

/**
 * Pure function — returns a new VitalsState with decay and damage applied.
 * @param state  Current vitals
 * @param deltaMs  Elapsed milliseconds since last update
 */
export function updateVitals(state: VitalsState, deltaMs: number): VitalsState {
  const hunger = clampVital(state.hunger - HUNGER_DECAY_RATE * deltaMs);
  const thirst = clampVital(state.thirst - THIRST_DECAY_RATE * deltaMs);

  let damage = 0;
  if (hunger <= 0) damage += STARVATION_DAMAGE_RATE * deltaMs;
  if (thirst <= 0) damage += DEHYDRATION_DAMAGE_RATE * deltaMs;

  const health = clampVital(state.health - damage);

  return { health, hunger, thirst };
}

export function isAlive(state: VitalsState): boolean {
  return state.health > 0;
}
