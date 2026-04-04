import * as ex from "excalibur";
import grassPng from "../sprites/ground/grass.png";
import berryBushPng from "../sprites/ground/berry-bush.png";
import treePng from "../sprites/ground/tree.png";
import waterPng from "../sprites/ground/water.png";
import rockBigPng from "../sprites/ground/rock-big.png";
import itemsPng from "../sprites/ground/items.png";
import sheepPng from "../sprites/ground/sheep.png";
import cowPng from "../sprites/ground/cow.png";
import { getCharacterImageSources } from "./character-compositor.ts";

// Mainhand weapon sprites (64×64 per frame, rendered as separate child actor)
import mainhandHammerPng from "../sprites/characters/equipment/mainhand/hammer.png";
import mainhandHatchetPng from "../sprites/characters/equipment/mainhand/hatchet.png";
import mainhandPickaxePng from "../sprites/characters/equipment/mainhand/pickaxe.png";
import mainhandSpearPng from "../sprites/characters/equipment/mainhand/spear.png";

export const grassImage = new ex.ImageSource(grassPng, {
  filtering: ex.ImageFiltering.Pixel,
});

export const berryBushImage = new ex.ImageSource(berryBushPng, {
  filtering: ex.ImageFiltering.Pixel,
});

export const treeImage = new ex.ImageSource(treePng, {
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

// Tree sprite
let treeSheet: ex.SpriteSheet | null = null;

function getTreeSheet(): ex.SpriteSheet {
  if (!treeSheet) {
    treeSheet = ex.SpriteSheet.fromImageSource({
      image: treeImage,
      grid: {
        rows: 1,
        columns: 8,
        spriteWidth: 32,
        spriteHeight: 32,
      },
    });
  }
  return treeSheet;
}

export function getTreeAnimation(): ex.Animation {
  const sheet = getTreeSheet();
  return ex.Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 500, ex.AnimationStrategy.Loop);
}

export function getTreeStumpAnimation(): ex.Animation {
  const sheet = getTreeSheet();
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

// Big rock sprite
export const rockBigImage = new ex.ImageSource(rockBigPng, {
  filtering: ex.ImageFiltering.Pixel,
});

let rockBigSheet: ex.SpriteSheet | null = null;

function getRockBigSheet(): ex.SpriteSheet {
  if (!rockBigSheet) {
    rockBigSheet = ex.SpriteSheet.fromImageSource({
      image: rockBigImage,
      grid: {
        rows: 1,
        columns: 4,
        spriteWidth: 32,
        spriteHeight: 32,
      },
    });
  }
  return rockBigSheet;
}

export function getRockBigAnimation(): ex.Animation {
  const sheet = getRockBigSheet();
  return ex.Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 500, ex.AnimationStrategy.Loop);
}

// Item sprites (16×16)
export const itemsImage = new ex.ImageSource(itemsPng, {
  filtering: ex.ImageFiltering.Pixel,
});

let itemsSheet: ex.SpriteSheet | null = null;

const ITEM_SPRITE_MAP: Record<string, number> = {
  "small-rock": 0,
  berry: 1,
  tunic: 2,
  pants: 3,
  boots: 4,
  branch: 5,
  hammer: 6,
  hatchet: 7,
  pickaxe: 8,
  spear: 9,
  "large-stone": 10,
  flint: 11,
  log: 12,
  mutton: 13,
  wool: 14,
  "cooked-mutton": 15,
  "cow-hide": 16,
  "raw-beef": 17,
  "cooked-beef": 18,
};

function getItemsSheet(): ex.SpriteSheet {
  if (!itemsSheet) {
    itemsSheet = ex.SpriteSheet.fromImageSource({
      image: itemsImage,
      grid: {
        rows: 1,
        columns: 19,
        spriteWidth: 16,
        spriteHeight: 16,
      },
    });
  }
  return itemsSheet;
}

/** Get a 16×16 sprite for an item by its itemSprite identifier. */
export function getItemSprite(itemSpriteId: string): ex.Sprite | null {
  const idx = ITEM_SPRITE_MAP[itemSpriteId];
  if (idx == null) return null;
  const sheet = getItemsSheet();
  return sheet.getSprite(idx, 0) ?? null;
}

// Weapon overlay sprites (64×64 frames for overflow beyond character tile)
const WEAPON_FRAME_SIZE = 64;
const WEAPON_FRAME_COUNT = 76;

const WEAPON_IMAGES: Record<string, ex.ImageSource> = {
  hammer: new ex.ImageSource(mainhandHammerPng, { filtering: ex.ImageFiltering.Pixel }),
  hatchet: new ex.ImageSource(mainhandHatchetPng, { filtering: ex.ImageFiltering.Pixel }),
  pickaxe: new ex.ImageSource(mainhandPickaxePng, { filtering: ex.ImageFiltering.Pixel }),
  spear: new ex.ImageSource(mainhandSpearPng, { filtering: ex.ImageFiltering.Pixel }),
};

const weaponSheetCache = new Map<string, ex.SpriteSheet>();

/** Get a 64×64 weapon sprite sheet for a mainhand item. */
export function getWeaponSpriteSheet(itemId: string): ex.SpriteSheet | null {
  const cached = weaponSheetCache.get(itemId);
  if (cached) return cached;

  const img = WEAPON_IMAGES[itemId];
  if (!img) return null;

  const sheet = ex.SpriteSheet.fromImageSource({
    image: img,
    grid: {
      rows: 1,
      columns: WEAPON_FRAME_COUNT,
      spriteWidth: WEAPON_FRAME_SIZE,
      spriteHeight: WEAPON_FRAME_SIZE,
    },
  });
  weaponSheetCache.set(itemId, sheet);
  return sheet;
}

// ─── Sheep sprite ─────────────────────────────────────────────────
// 12 frames: 4 directions × 3 poses (idle, walk1, walk2), 32×32 each.

export const sheepImage = new ex.ImageSource(sheepPng, {
  filtering: ex.ImageFiltering.Pixel,
});

let sheepSheet: ex.SpriteSheet | null = null;

/** Get the sheep sprite sheet (12 frames, 32×32). */
export function getSheepSpriteSheet(): ex.SpriteSheet {
  if (!sheepSheet) {
    sheepSheet = ex.SpriteSheet.fromImageSource({
      image: sheepImage,
      grid: {
        rows: 1,
        columns: 12,
        spriteWidth: 32,
        spriteHeight: 32,
      },
    });
  }
  return sheepSheet;
}

// ─── Cow sprite ──────────────────────────────────────────────────
// 12 frames: 4 directions × 3 poses (idle, walk1, walk2), 32×32 each.

export const cowImage = new ex.ImageSource(cowPng, {
  filtering: ex.ImageFiltering.Pixel,
});

let cowSheet: ex.SpriteSheet | null = null;

/** Get the cow sprite sheet (12 frames, 32×32). */
export function getCowSpriteSheet(): ex.SpriteSheet {
  if (!cowSheet) {
    cowSheet = ex.SpriteSheet.fromImageSource({
      image: cowImage,
      grid: {
        rows: 1,
        columns: 12,
        spriteWidth: 32,
        spriteHeight: 32,
      },
    });
  }
  return cowSheet;
}

export function getAllImageSources(): ex.ImageSource[] {
  return [
    grassImage,
    berryBushImage,
    treeImage,
    waterImage,
    rockBigImage,
    itemsImage,
    sheepImage,
    cowImage,
    ...getCharacterImageSources(),
    ...Object.values(WEAPON_IMAGES),
  ];
}
