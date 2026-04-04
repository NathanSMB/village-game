import type { PaletteOption, StyleOption } from "../types/character.ts";

export const SEX_OPTIONS: StyleOption[] = [
  { name: "Male", id: "male" },
  { name: "Female", id: "female" },
];

export const SKIN_TONES: PaletteOption[] = [
  { name: "Pale", r: 255, g: 224, b: 196 },
  { name: "Light", r: 234, g: 192, b: 158 },
  { name: "Warm", r: 210, g: 160, b: 120 },
  { name: "Tan", r: 180, g: 128, b: 90 },
  { name: "Brown", r: 140, g: 95, b: 62 },
  { name: "Dark", r: 100, g: 65, b: 40 },
  { name: "Deep", r: 70, g: 45, b: 28 },
];

export const HAIR_STYLES: StyleOption[] = [
  { name: "Short", id: "short" },
  { name: "Long", id: "long" },
  { name: "Ponytail", id: "ponytail" },
  { name: "Curly", id: "curly" },
  { name: "Bald", id: "bald" },
];

export const HAIR_COLORS: PaletteOption[] = [
  { name: "Black", r: 30, g: 25, b: 20 },
  { name: "Brown", r: 100, g: 65, b: 35 },
  { name: "Auburn", r: 140, g: 60, b: 30 },
  { name: "Blonde", r: 220, g: 190, b: 120 },
  { name: "Red", r: 180, g: 50, b: 30 },
  { name: "Gray", r: 160, g: 160, b: 160 },
  { name: "White", r: 230, g: 230, b: 225 },
];

export const FACIAL_HAIR_STYLES: StyleOption[] = [
  { name: "None", id: "none" },
  { name: "Stubble", id: "stubble" },
  { name: "Beard", id: "beard" },
  { name: "Mustache", id: "mustache" },
  { name: "Full Beard", id: "full" },
];

export const CLOTHING_COLORS: PaletteOption[] = [
  { name: "Forest", r: 60, g: 100, b: 50 },
  { name: "Brown", r: 120, g: 75, b: 45 },
  { name: "Navy", r: 40, g: 50, b: 90 },
  { name: "Crimson", r: 140, g: 35, b: 35 },
  { name: "Gray", r: 100, g: 100, b: 105 },
  { name: "Sand", r: 180, g: 160, b: 120 },
  { name: "Plum", r: 90, g: 45, b: 80 },
  { name: "Teal", r: 45, g: 100, b: 100 },
  { name: "White", r: 230, g: 230, b: 225 },
];
