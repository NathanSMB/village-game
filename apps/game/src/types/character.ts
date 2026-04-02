export type Sex = "male" | "female";

export interface CharacterAppearance {
  sex: Sex;
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  facialHair: number;
  equipmentColors: {
    torso: number;
    legs: number;
    feet: number;
  };
}

export interface PaletteOption {
  name: string;
  r: number;
  g: number;
  b: number;
}

export interface StyleOption {
  name: string;
  id: string;
}

export function defaultAppearance(): CharacterAppearance {
  return {
    sex: "male",
    skinTone: 2,
    hairStyle: 0,
    hairColor: 1,
    facialHair: 0,
    equipmentColors: {
      torso: 0,
      legs: 0,
      feet: 0,
    },
  };
}
