import * as ex from "excalibur";
import grassPng from "../sprites/ground/grass.png";
import berryBushPng from "../sprites/ground/berry-bush.png";
import waterPng from "../sprites/ground/water.png";
import { getCharacterImageSources } from "./character-compositor.ts";

export const grassImage = new ex.ImageSource(grassPng, {
  filtering: ex.ImageFiltering.Pixel,
});

export const berryBushImage = new ex.ImageSource(berryBushPng, {
  filtering: ex.ImageFiltering.Pixel,
});

export const waterImage = new ex.ImageSource(waterPng, {
  filtering: ex.ImageFiltering.Pixel,
});

let grassSheet: ex.SpriteSheet | null = null;
let grassAnimationCache: ex.Animation[] | null = null;

function getGrassSheet(): ex.SpriteSheet {
  if (!grassSheet) {
    grassSheet = ex.SpriteSheet.fromImageSource({
      image: grassImage,
      grid: {
        rows: 1,
        columns: 16,
        spriteWidth: 32,
        spriteHeight: 32,
      },
    });
  }
  return grassSheet;
}

export function getGrassAnimations(): ex.Animation[] {
  if (!grassAnimationCache) {
    const sheet = getGrassSheet();
    grassAnimationCache = [
      ex.Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 400, ex.AnimationStrategy.Loop),
      ex.Animation.fromSpriteSheet(sheet, [4, 5, 6, 7], 400, ex.AnimationStrategy.Loop),
      ex.Animation.fromSpriteSheet(sheet, [8, 9, 10, 11], 400, ex.AnimationStrategy.Loop),
      ex.Animation.fromSpriteSheet(sheet, [12, 13, 14, 15], 400, ex.AnimationStrategy.Loop),
    ];
  }
  return grassAnimationCache;
}

let berryBushSheet: ex.SpriteSheet | null = null;

function getBerryBushSheet(): ex.SpriteSheet {
  if (!berryBushSheet) {
    berryBushSheet = ex.SpriteSheet.fromImageSource({
      image: berryBushImage,
      grid: {
        rows: 1,
        columns: 8,
        spriteWidth: 32,
        spriteHeight: 32,
      },
    });
  }
  return berryBushSheet;
}

export function getBerryBushFullAnimation(): ex.Animation {
  const sheet = getBerryBushSheet();
  return ex.Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 500, ex.AnimationStrategy.Loop);
}

export function getBerryBushPickedAnimation(): ex.Animation {
  const sheet = getBerryBushSheet();
  return ex.Animation.fromSpriteSheet(sheet, [4, 5, 6, 7], 500, ex.AnimationStrategy.Loop);
}

// Water tile types — 13 types × 4 animation frames = 52 total frames
// Each type occupies 4 consecutive frames in the sprite sheet
let waterSheet: ex.SpriteSheet | null = null;

const WATER_ANIM_FRAMES = 4;
const WATER_TOTAL_FRAMES = 52;

function getWaterSheet(): ex.SpriteSheet {
  if (!waterSheet) {
    waterSheet = ex.SpriteSheet.fromImageSource({
      image: waterImage,
      grid: {
        rows: 1,
        columns: WATER_TOTAL_FRAMES,
        spriteWidth: 32,
        spriteHeight: 32,
      },
    });
  }
  return waterSheet;
}

/**
 * Water tile type indices (each maps to 4 consecutive frames):
 *  0 = center (full water)
 *  1 = edge-north (grass on top)
 *  2 = edge-south (grass on bottom)
 *  3 = edge-east (grass on right)
 *  4 = edge-west (grass on left)
 *  5 = outer corner NW
 *  6 = outer corner NE
 *  7 = outer corner SW
 *  8 = outer corner SE
 *  9 = inner corner NW
 * 10 = inner corner NE
 * 11 = inner corner SW
 * 12 = inner corner SE
 */
export const WaterTileType = {
  Center: 0,
  EdgeN: 1,
  EdgeS: 2,
  EdgeE: 3,
  EdgeW: 4,
  OuterNW: 5,
  OuterNE: 6,
  OuterSW: 7,
  OuterSE: 8,
  InnerNW: 9,
  InnerNE: 10,
  InnerSW: 11,
  InnerSE: 12,
} as const;

export type WaterTileTypeValue = (typeof WaterTileType)[keyof typeof WaterTileType];

/** Get an animation for a specific water tile type. */
export function getWaterAnimation(tileType: WaterTileTypeValue): ex.Animation {
  const sheet = getWaterSheet();
  const startFrame = tileType * WATER_ANIM_FRAMES;
  const frames = [startFrame, startFrame + 1, startFrame + 2, startFrame + 3];
  return ex.Animation.fromSpriteSheet(sheet, frames, 500, ex.AnimationStrategy.Loop);
}

export function getAllImageSources(): ex.ImageSource[] {
  return [grassImage, berryBushImage, waterImage, ...getCharacterImageSources()];
}
