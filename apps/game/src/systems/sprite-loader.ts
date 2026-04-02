import * as ex from "excalibur";
import grassPng from "../sprites/ground/grass.png";
import { getCharacterImageSources } from "./character-compositor.ts";

export const grassImage = new ex.ImageSource(grassPng, {
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

export function getAllImageSources(): ex.ImageSource[] {
  return [grassImage, ...getCharacterImageSources()];
}
