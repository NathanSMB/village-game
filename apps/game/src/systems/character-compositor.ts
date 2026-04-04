import * as ex from "excalibur";
import type { CharacterAppearance, PaletteOption } from "../types/character.ts";
import type { Equipment } from "../types/inventory.ts";
import { EquipmentSlot } from "../types/item.ts";
import {
  CLOTHING_COLORS,
  FACIAL_HAIR_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
} from "../data/character-options.ts";

// Layer PNG imports
import bodyMalePng from "../sprites/characters/body/body-male.png";
import bodyFemalePng from "../sprites/characters/body/body-female.png";
import hairShortPng from "../sprites/characters/hair/hair-short.png";
import hairLongPng from "../sprites/characters/hair/hair-long.png";
import hairPonytailPng from "../sprites/characters/hair/hair-ponytail.png";
import hairCurlyPng from "../sprites/characters/hair/hair-curly.png";
import facialStubblePng from "../sprites/characters/facial-hair/facial-stubble.png";
import facialBeardPng from "../sprites/characters/facial-hair/facial-beard.png";
import facialMustachePng from "../sprites/characters/facial-hair/facial-mustache.png";
import facialFullPng from "../sprites/characters/facial-hair/facial-full.png";
import torsoTunicPng from "../sprites/characters/equipment/torso/tunic.png";
import legsPantsPng from "../sprites/characters/equipment/legs/pants.png";
import feetBootsPng from "../sprites/characters/equipment/feet/boots.png";
import mainhandHammerPng from "../sprites/characters/equipment/mainhand/hammer.png";
import mainhandHatchetPng from "../sprites/characters/equipment/mainhand/hatchet.png";
import mainhandPickaxePng from "../sprites/characters/equipment/mainhand/pickaxe.png";
import mainhandSpearPng from "../sprites/characters/equipment/mainhand/spear.png";

const STRIP_W = 2432; // 76 frames × 32px
const STRIP_H = 32;
const FRAME_SIZE = 32;
const FRAME_COUNT = 76;

// Reference colors (must match what the Lua scripts draw)
const REF_SKIN = { r: 255, g: 0, b: 255 };
const REF_SKIN_SHADOW = { r: 204, g: 0, b: 204 };
const REF_SKIN_HIGHLIGHT = { r: 255, g: 102, b: 255 };

const REF_CLOTH = { r: 0, g: 255, b: 255 };
const REF_CLOTH_SHADOW = { r: 0, g: 204, b: 204 };
const REF_CLOTH_HIGHLIGHT = { r: 102, g: 255, b: 255 };

const REF_HAIR = { r: 255, g: 255, b: 0 };
const REF_HAIR_SHADOW = { r: 204, g: 204, b: 0 };

interface RGB {
  r: number;
  g: number;
  b: number;
}

// All layer images
const LAYER_IMAGES: Record<string, ex.ImageSource> = {};

function addLayer(name: string, url: string): void {
  LAYER_IMAGES[name] = new ex.ImageSource(url, { filtering: ex.ImageFiltering.Pixel });
}

addLayer("body-male", bodyMalePng);
addLayer("body-female", bodyFemalePng);
addLayer("hair-short", hairShortPng);
addLayer("hair-long", hairLongPng);
addLayer("hair-ponytail", hairPonytailPng);
addLayer("hair-curly", hairCurlyPng);
addLayer("facial-stubble", facialStubblePng);
addLayer("facial-beard", facialBeardPng);
addLayer("facial-mustache", facialMustachePng);
addLayer("facial-full", facialFullPng);
addLayer("torso-tunic", torsoTunicPng);
addLayer("legs-pants", legsPantsPng);
addLayer("feet-boots", feetBootsPng);
addLayer("mainhand-hammer", mainhandHammerPng);
addLayer("mainhand-hatchet", mainhandHatchetPng);
addLayer("mainhand-pickaxe", mainhandPickaxePng);
addLayer("mainhand-spear", mainhandSpearPng);

const MAINHAND_LAYERS: Record<string, string> = {
  hammer: "mainhand-hammer",
  hatchet: "mainhand-hatchet",
  pickaxe: "mainhand-pickaxe",
  spear: "mainhand-spear",
};

export function getCharacterImageSources(): ex.ImageSource[] {
  return Object.values(LAYER_IMAGES);
}

// Palette swap cache
const compositeCache = new Map<string, ex.SpriteSheet>();

function compositeKey(a: CharacterAppearance, equipment?: Equipment): string {
  return JSON.stringify({ a, equipment });
}

function darken(c: PaletteOption, amount: number): RGB {
  return {
    r: Math.max(0, Math.round(c.r * (1 - amount))),
    g: Math.max(0, Math.round(c.g * (1 - amount))),
    b: Math.max(0, Math.round(c.b * (1 - amount))),
  };
}

function lighten(c: PaletteOption, amount: number): RGB {
  return {
    r: Math.min(255, Math.round(c.r + (255 - c.r) * amount)),
    g: Math.min(255, Math.round(c.g + (255 - c.g) * amount)),
    b: Math.min(255, Math.round(c.b + (255 - c.b) * amount)),
  };
}

function matchesRef(r: number, g: number, b: number, ref: RGB): boolean {
  return r === ref.r && g === ref.g && b === ref.b;
}

interface PaletteMap {
  from: RGB;
  to: RGB;
}

function paletteSwapLayer(
  ctx: CanvasRenderingContext2D,
  sourceImg: HTMLImageElement,
  mappings: PaletteMap[],
): void {
  // Draw source to a temp canvas, swap pixels, draw result to ctx
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = STRIP_W;
  tempCanvas.height = STRIP_H;
  const tempCtx = tempCanvas.getContext("2d")!;
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(sourceImg, 0, 0);

  const imageData = tempCtx.getImageData(0, 0, STRIP_W, STRIP_H);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;

    for (const mapping of mappings) {
      if (matchesRef(r, g, b, mapping.from)) {
        data[i] = mapping.to.r;
        data[i + 1] = mapping.to.g;
        data[i + 2] = mapping.to.b;
        break;
      }
    }
  }

  tempCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tempCanvas, 0, 0);
}

function getSkinMappings(skinTone: PaletteOption): PaletteMap[] {
  return [
    { from: REF_SKIN, to: skinTone },
    { from: REF_SKIN_SHADOW, to: darken(skinTone, 0.2) },
    { from: REF_SKIN_HIGHLIGHT, to: lighten(skinTone, 0.15) },
  ];
}

function getClothMappings(color: PaletteOption): PaletteMap[] {
  return [
    { from: REF_CLOTH, to: color },
    { from: REF_CLOTH_SHADOW, to: darken(color, 0.25) },
    { from: REF_CLOTH_HIGHLIGHT, to: lighten(color, 0.2) },
  ];
}

function getHairMappings(hairColor: PaletteOption): PaletteMap[] {
  return [
    { from: REF_HAIR, to: hairColor },
    { from: REF_HAIR_SHADOW, to: darken(hairColor, 0.25) },
  ];
}

function drawFemaleChestDetail(ctx: CanvasRenderingContext2D, shadow: RGB): void {
  // Draw breast shading on front-facing frames (dir=0: frames 0, 1, 2)
  // Matches body Lua positions: bodyX+1=12 w3 and bodyX+bodyW-4=17 w3, y=16
  ctx.fillStyle = `rgb(${shadow.r},${shadow.g},${shadow.b})`;
  for (let frame = 0; frame < 3; frame++) {
    const fx = frame * FRAME_SIZE;
    ctx.fillRect(fx + 12, 17, 3, 1);
    ctx.fillRect(fx + 17, 17, 3, 1);
  }
}

export function compositeCharacter(
  appearance: CharacterAppearance,
  equipment?: Equipment,
): ex.SpriteSheet {
  const key = compositeKey(appearance, equipment);
  const cached = compositeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const skin = SKIN_TONES[appearance.skinTone];
  const hairColor = HAIR_COLORS[appearance.hairColor];

  // 1. Body
  const bodyKey = appearance.sex === "male" ? "body-male" : "body-female";
  paletteSwapLayer(ctx, LAYER_IMAGES[bodyKey].image, getSkinMappings(skin));

  // 2-4. Equipment layers — conditional on equipped items
  if (equipment) {
    const feetItem = equipment[EquipmentSlot.Feet];
    if (feetItem) {
      const color = CLOTHING_COLORS[feetItem.colorIndex ?? 0];
      paletteSwapLayer(ctx, LAYER_IMAGES["feet-boots"].image, getClothMappings(color));
    }
    const legsItem = equipment[EquipmentSlot.Legs];
    if (legsItem) {
      const color = CLOTHING_COLORS[legsItem.colorIndex ?? 0];
      paletteSwapLayer(ctx, LAYER_IMAGES["legs-pants"].image, getClothMappings(color));
    }
    const torsoItem = equipment[EquipmentSlot.Torso];
    if (torsoItem) {
      const color = CLOTHING_COLORS[torsoItem.colorIndex ?? 0];
      paletteSwapLayer(ctx, LAYER_IMAGES["torso-tunic"].image, getClothMappings(color));
      if (appearance.sex === "female") {
        drawFemaleChestDetail(ctx, darken(color, 0.25));
      }
    }
  } else {
    // Character creator preview — render all layers from appearance colors
    const feetColor = CLOTHING_COLORS[appearance.equipmentColors.feet];
    const legsColor = CLOTHING_COLORS[appearance.equipmentColors.legs];
    const torsoColor = CLOTHING_COLORS[appearance.equipmentColors.torso];
    paletteSwapLayer(ctx, LAYER_IMAGES["feet-boots"].image, getClothMappings(feetColor));
    paletteSwapLayer(ctx, LAYER_IMAGES["legs-pants"].image, getClothMappings(legsColor));
    paletteSwapLayer(ctx, LAYER_IMAGES["torso-tunic"].image, getClothMappings(torsoColor));
    if (appearance.sex === "female") {
      drawFemaleChestDetail(ctx, darken(torsoColor, 0.25));
    }
  }

  // 5. Facial hair (male only, skip "none")
  if (appearance.sex === "male") {
    const facialStyle = FACIAL_HAIR_STYLES[appearance.facialHair];
    if (facialStyle.id !== "none") {
      const facialKey = `facial-${facialStyle.id}`;
      paletteSwapLayer(ctx, LAYER_IMAGES[facialKey].image, getHairMappings(hairColor));
    }
  }

  // 6. Hair (skip bald)
  const hairStyle = HAIR_STYLES[appearance.hairStyle];
  if (hairStyle.id !== "bald") {
    const hairKey = `hair-${hairStyle.id}`;
    paletteSwapLayer(ctx, LAYER_IMAGES[hairKey].image, getHairMappings(hairColor));
  }

  // 7. Main-hand equipment (tools — drawn on top, no palette swap)
  if (equipment) {
    const mainHandItem = equipment[EquipmentSlot.MainHand];
    if (mainHandItem) {
      const layerKey = MAINHAND_LAYERS[mainHandItem.id];
      if (layerKey && LAYER_IMAGES[layerKey]) {
        ctx.drawImage(LAYER_IMAGES[layerKey].image, 0, 0);
      }
    }
  }

  // Create ImageSource from the composited canvas
  const imageSource = ex.ImageSource.fromHtmlCanvasElement(canvas, {
    filtering: ex.ImageFiltering.Pixel,
  });

  const sheet = ex.SpriteSheet.fromImageSource({
    image: imageSource,
    grid: {
      rows: 1,
      columns: FRAME_COUNT,
      spriteWidth: FRAME_SIZE,
      spriteHeight: FRAME_SIZE,
    },
  });

  compositeCache.set(key, sheet);
  return sheet;
}

export function getCharacterPreviewSprite(
  appearance: CharacterAppearance,
  scale: number,
): ex.Sprite {
  const sheet = compositeCharacter(appearance);
  const sprite = sheet.getSprite(0, 0)!.clone();
  sprite.scale = ex.vec(scale, scale);
  return sprite;
}
