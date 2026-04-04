export interface VitalsState {
  health: number; // 0–100
  hunger: number; // 0–100 (100 = full, 0 = starving)
  thirst: number; // 0–100 (100 = full, 0 = dehydrated)
  energy: number; // 0–1000
}

/** Milliseconds for a full bar (100) to reach 0. */
export const HUNGER_DEPLETION_MS = 8 * 60 * 1000; // 8 minutes
export const THIRST_DEPLETION_MS = 4 * 60 * 1000; // 4 minutes (2× faster)

/** Milliseconds for health to go from 100 → 0 when starving / dehydrated. */
export const STARVATION_DAMAGE_MS = 5 * 60 * 1000; // 5 minutes
export const DEHYDRATION_DAMAGE_MS = 3 * 60 * 1000; // 3 minutes

/** Energy constants. */
export const ENERGY_MAX = 1000;
/** Energy decay: 1 per second. */
const ENERGY_DECAY_PER_MS = 1 / 1000;
/** Energy recovery while sleeping: 2 per second. */
const ENERGY_RECOVERY_PER_MS = 2 / 1000;

const HUNGER_DECAY_RATE = 100 / HUNGER_DEPLETION_MS;
const THIRST_DECAY_RATE = 100 / THIRST_DEPLETION_MS;
const STARVATION_DAMAGE_RATE = 100 / STARVATION_DAMAGE_MS;
const DEHYDRATION_DAMAGE_RATE = 100 / DEHYDRATION_DAMAGE_MS;

export function clampVital(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function clampEnergy(value: number): number {
  return Math.max(0, Math.min(ENERGY_MAX, value));
}

export function defaultVitals(): VitalsState {
  return { health: 100, hunger: 100, thirst: 100, energy: ENERGY_MAX };
}

/**
 * Pure function — returns a new VitalsState with decay and damage applied.
 * @param state  Current vitals
 * @param deltaMs  Elapsed milliseconds since last update
 * @param sleeping  Whether the player is currently sleeping in a bed
 */
export function updateVitals(state: VitalsState, deltaMs: number, sleeping = false): VitalsState {
  const hunger = clampVital(state.hunger - HUNGER_DECAY_RATE * deltaMs);
  const thirst = clampVital(state.thirst - THIRST_DECAY_RATE * deltaMs);

  let damage = 0;
  if (hunger <= 0) damage += STARVATION_DAMAGE_RATE * deltaMs;
  if (thirst <= 0) damage += DEHYDRATION_DAMAGE_RATE * deltaMs;

  const health = clampVital(state.health - damage);

  // Energy: decays when awake, recovers when sleeping.
  // Handle old saves that lack energy by defaulting to ENERGY_MAX.
  const currentEnergy = state.energy ?? ENERGY_MAX;
  const energyDelta = sleeping
    ? ENERGY_RECOVERY_PER_MS * deltaMs
    : -(ENERGY_DECAY_PER_MS * deltaMs);
  const energy = clampEnergy(currentEnergy + energyDelta);

  return { health, hunger, thirst, energy };
}

export function isAlive(state: VitalsState): boolean {
  return state.health > 0;
}
