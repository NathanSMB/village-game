import { describe, expect, test } from "vite-plus/test";
import {
  DEHYDRATION_DAMAGE_MS,
  HUNGER_DEPLETION_MS,
  STARVATION_DAMAGE_MS,
  THIRST_DEPLETION_MS,
  clampVital,
  defaultVitals,
  isAlive,
  updateVitals,
} from "./vitals.ts";

describe("defaultVitals", () => {
  test("returns full vitals", () => {
    expect(defaultVitals()).toEqual({ health: 100, hunger: 100, thirst: 100 });
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
    expect(isAlive({ health: 1, hunger: 0, thirst: 0 })).toBe(true);
  });

  test("returns false when health is 0", () => {
    expect(isAlive({ health: 0, hunger: 50, thirst: 50 })).toBe(false);
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
    expect(state).toEqual({ health: 100, hunger: 100, thirst: 100 });
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
    const starving = { health: 100, hunger: 0, thirst: 100 };
    const result = updateVitals(starving, 1000);
    expect(result.health).toBeLessThan(100);
  });

  test("dehydration damages health when thirst is 0", () => {
    const dehydrated = { health: 100, hunger: 100, thirst: 0 };
    const result = updateVitals(dehydrated, 1000);
    expect(result.health).toBeLessThan(100);
  });

  test("starvation and dehydration damage stack", () => {
    const both = { health: 100, hunger: 0, thirst: 0 };
    const onlyStarving = { health: 100, hunger: 0, thirst: 100 };
    const onlyDehydrated = { health: 100, hunger: 100, thirst: 0 };

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
    const starving = { health: 100, hunger: 0, thirst: 100 };
    const result = updateVitals(starving, STARVATION_DAMAGE_MS);
    expect(result.health).toBeCloseTo(0, 5);
  });

  test("dehydration alone kills in DEHYDRATION_DAMAGE_MS", () => {
    const dehydrated = { health: 100, hunger: 100, thirst: 0 };
    const result = updateVitals(dehydrated, DEHYDRATION_DAMAGE_MS);
    expect(result.health).toBeCloseTo(0, 5);
  });
});
