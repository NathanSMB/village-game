import { describe, expect, test } from "vite-plus/test";
import {
  DEHYDRATION_DAMAGE_MS,
  ENERGY_MAX,
  HUNGER_DEPLETION_MS,
  STARVATION_DAMAGE_MS,
  THIRST_DEPLETION_MS,
  clampEnergy,
  clampVital,
  defaultVitals,
  isAlive,
  updateVitals,
} from "./vitals.ts";

describe("defaultVitals", () => {
  test("returns full vitals", () => {
    expect(defaultVitals()).toEqual({ health: 100, hunger: 100, thirst: 100, energy: ENERGY_MAX });
  });
});

describe("clampVital", () => {
  test("clamps below 0 to 0", () => {
    expect(clampVital(-5)).toBe(0);
  });

  test("clamps above 100 to 100", () => {
    expect(clampVital(120)).toBe(100);
  });

  test("leaves values in range unchanged", () => {
    expect(clampVital(50)).toBe(50);
  });
});

describe("isAlive", () => {
  test("returns true when health > 0", () => {
    expect(isAlive({ health: 1, hunger: 0, thirst: 0, energy: 0 })).toBe(true);
  });

  test("returns false when health is 0", () => {
    expect(isAlive({ health: 0, hunger: 50, thirst: 50, energy: 500 })).toBe(false);
  });
});

describe("updateVitals", () => {
  test("zero delta returns identical state", () => {
    const state = defaultVitals();
    expect(updateVitals(state, 0)).toEqual(state);
  });

  test("does not mutate the input state", () => {
    const state = defaultVitals();
    updateVitals(state, 1000);
    expect(state).toEqual({ health: 100, hunger: 100, thirst: 100, energy: ENERGY_MAX });
  });

  test("hunger depletes from 100 to 0 in HUNGER_DEPLETION_MS", () => {
    const result = updateVitals(defaultVitals(), HUNGER_DEPLETION_MS);
    expect(result.hunger).toBeCloseTo(0, 5);
  });

  test("thirst depletes from 100 to 0 in THIRST_DEPLETION_MS", () => {
    const result = updateVitals(defaultVitals(), THIRST_DEPLETION_MS);
    expect(result.thirst).toBeCloseTo(0, 5);
  });

  test("thirst depletes faster than hunger", () => {
    const delta = THIRST_DEPLETION_MS / 2;
    const result = updateVitals(defaultVitals(), delta);
    expect(result.thirst).toBeLessThan(result.hunger);
  });

  test("values never go below 0", () => {
    const result = updateVitals(defaultVitals(), HUNGER_DEPLETION_MS * 10);
    expect(result.hunger).toBe(0);
    expect(result.thirst).toBe(0);
    expect(result.health).toBe(0);
  });

  test("no health damage while hunger and thirst are above 0", () => {
    const result = updateVitals(defaultVitals(), 1000);
    expect(result.health).toBe(100);
  });

  test("starvation damages health when hunger is 0", () => {
    const starving = { health: 100, hunger: 0, thirst: 100, energy: ENERGY_MAX };
    const result = updateVitals(starving, 1000);
    expect(result.health).toBeLessThan(100);
  });

  test("dehydration damages health when thirst is 0", () => {
    const dehydrated = { health: 100, hunger: 100, thirst: 0, energy: ENERGY_MAX };
    const result = updateVitals(dehydrated, 1000);
    expect(result.health).toBeLessThan(100);
  });

  test("starvation and dehydration damage stack", () => {
    const both = { health: 100, hunger: 0, thirst: 0, energy: ENERGY_MAX };
    const onlyStarving = { health: 100, hunger: 0, thirst: 100, energy: ENERGY_MAX };
    const onlyDehydrated = { health: 100, hunger: 100, thirst: 0, energy: ENERGY_MAX };

    const delta = 10_000;
    const bothResult = updateVitals(both, delta);
    const starvingResult = updateVitals(onlyStarving, delta);
    const dehydratedResult = updateVitals(onlyDehydrated, delta);

    const starvingDmg = 100 - starvingResult.health;
    const dehydratedDmg = 100 - dehydratedResult.health;
    const bothDmg = 100 - bothResult.health;

    expect(bothDmg).toBeCloseTo(starvingDmg + dehydratedDmg, 5);
  });

  test("starvation alone kills in STARVATION_DAMAGE_MS", () => {
    const starving = { health: 100, hunger: 0, thirst: 100, energy: ENERGY_MAX };
    const result = updateVitals(starving, STARVATION_DAMAGE_MS);
    expect(result.health).toBeCloseTo(0, 5);
  });

  test("dehydration alone kills in DEHYDRATION_DAMAGE_MS", () => {
    const dehydrated = { health: 100, hunger: 100, thirst: 0, energy: ENERGY_MAX };
    const result = updateVitals(dehydrated, DEHYDRATION_DAMAGE_MS);
    expect(result.health).toBeCloseTo(0, 5);
  });

  test("energy decays at 1 per second when awake", () => {
    const state = defaultVitals();
    const result = updateVitals(state, 10_000); // 10 seconds
    expect(result.energy).toBeCloseTo(ENERGY_MAX - 10, 1);
  });

  test("energy recovers at 3 per second when sleeping", () => {
    const state = { ...defaultVitals(), energy: 500 };
    const result = updateVitals(state, 10_000, true); // 10 seconds, sleeping
    expect(result.energy).toBeCloseTo(530, 1);
  });

  test("hunger decays at 1/5 rate while sleeping", () => {
    const state = defaultVitals();
    const awake = updateVitals(state, 60_000); // 1 minute awake
    const asleep = updateVitals(state, 60_000, true); // 1 minute sleeping
    const awakeDecay = 100 - awake.hunger;
    const asleepDecay = 100 - asleep.hunger;
    expect(asleepDecay).toBeCloseTo(awakeDecay / 5, 5);
  });

  test("thirst decays at 1/5 rate while sleeping", () => {
    const state = defaultVitals();
    const awake = updateVitals(state, 60_000);
    const asleep = updateVitals(state, 60_000, true);
    const awakeDecay = 100 - awake.thirst;
    const asleepDecay = 100 - asleep.thirst;
    expect(asleepDecay).toBeCloseTo(awakeDecay / 5, 5);
  });

  test("energy never exceeds ENERGY_MAX", () => {
    const state = defaultVitals(); // energy = ENERGY_MAX
    const result = updateVitals(state, 10_000, true); // sleeping
    expect(result.energy).toBe(ENERGY_MAX);
  });

  test("energy never goes below 0", () => {
    const state = { ...defaultVitals(), energy: 5 };
    const result = updateVitals(state, 60_000); // 60 seconds, should deplete 60
    expect(result.energy).toBe(0);
  });
});

describe("clampEnergy", () => {
  test("clamps below 0 to 0", () => {
    expect(clampEnergy(-10)).toBe(0);
  });

  test("clamps above ENERGY_MAX to ENERGY_MAX", () => {
    expect(clampEnergy(ENERGY_MAX + 100)).toBe(ENERGY_MAX);
  });

  test("leaves values in range unchanged", () => {
    expect(clampEnergy(500)).toBe(500);
  });
});
