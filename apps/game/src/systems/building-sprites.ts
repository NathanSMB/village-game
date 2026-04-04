import * as ex from "excalibur";

const TILE = 32;

// Wood color palette
const BROWN_DARK = "#4a2800";
const BROWN_MED = "#6b4400";
const BROWN_LIGHT = "#8b6914";
const BROWN_PLANK = "#a0782c";
const BROWN_HIGHLIGHT = "#c09848";
const OUTLINE = "#2a1a00";
const WINDOW_BG = "#1a1a2e";
const DOOR_KNOB = "#d4a850";
const FENCE_POST = "#5c3a10";
const FENCE_RAIL = "#7a5020";
const LATCH_COLOR = "#888888";

// Hologram tint
const HOLO_CYAN = "#00ccff";

export type SpriteMode = "solid" | "hologram" | "ghost";

function applyMode(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  if (mode === "hologram") {
    ctx.globalAlpha = 0.45;
  } else if (mode === "ghost") {
    ctx.globalAlpha = 0.25;
  }
}

function applyHologramTint(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  if (mode === "hologram" || mode === "ghost") {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = HOLO_CYAN;
    ctx.globalAlpha = mode === "hologram" ? 0.35 : 0.4;
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
}

// ========== Wall ==========

function drawWallBase(ctx: CanvasRenderingContext2D): void {
  // Fill with medium brown
  ctx.fillStyle = BROWN_MED;
  ctx.fillRect(1, 1, TILE - 2, TILE - 2);

  // Horizontal log lines
  ctx.fillStyle = BROWN_DARK;
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 7;
    ctx.fillRect(1, y, TILE - 2, 1);
  }

  // Lighter log highlights
  ctx.fillStyle = BROWN_LIGHT;
  for (let i = 0; i < 4; i++) {
    const y = 6 + i * 7;
    ctx.fillRect(2, y, TILE - 4, 1);
  }

  // Outline
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
}

export function drawWall(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  applyMode(ctx, mode);
  drawWallBase(ctx);
  applyHologramTint(ctx, mode);
}

// ========== Wall with Window ==========

export function drawWallWindow(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  applyMode(ctx, mode);
  drawWallBase(ctx);

  // Window opening
  const wx = 11;
  const wy = 8;
  const ww = 10;
  const wh = 10;
  ctx.fillStyle = WINDOW_BG;
  ctx.fillRect(wx, wy, ww, wh);

  // Window frame
  ctx.strokeStyle = BROWN_PLANK;
  ctx.lineWidth = 1;
  ctx.strokeRect(wx + 0.5, wy + 0.5, ww - 1, wh - 1);

  // Cross mullion
  ctx.fillStyle = BROWN_PLANK;
  ctx.fillRect(wx + 4, wy, 2, wh);
  ctx.fillRect(wx, wy + 4, ww, 2);

  applyHologramTint(ctx, mode);
}

// ========== Wall with Door ==========

export function drawWallDoor(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  isOpen: boolean,
): void {
  applyMode(ctx, mode);
  drawWallBase(ctx);

  const dx = 10;
  const dy = 8;
  const dw = 12;
  const dh = 23;

  if (isOpen) {
    // Open door: show empty space
    ctx.fillStyle = WINDOW_BG;
    ctx.fillRect(dx, dy, dw, dh);
    // Door frame
    ctx.strokeStyle = BROWN_DARK;
    ctx.lineWidth = 1;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
  } else {
    // Closed door panel
    ctx.fillStyle = BROWN_PLANK;
    ctx.fillRect(dx, dy, dw, dh);
    // Door planks
    ctx.fillStyle = BROWN_HIGHLIGHT;
    ctx.fillRect(dx + 3, dy + 1, 1, dh - 2);
    ctx.fillRect(dx + 8, dy + 1, 1, dh - 2);
    // Knob
    ctx.fillStyle = DOOR_KNOB;
    ctx.fillRect(dx + dw - 4, dy + dh / 2, 2, 2);
    // Door frame
    ctx.strokeStyle = BROWN_DARK;
    ctx.lineWidth = 1;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
  }

  applyHologramTint(ctx, mode);
}

// ========== Floor ==========

export function drawFloor(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  applyMode(ctx, mode);

  // Light brown base
  ctx.fillStyle = BROWN_PLANK;
  ctx.fillRect(0, 0, TILE, TILE);

  // Plank lines (5 planks)
  const plankHeight = 6;
  for (let i = 0; i < 5; i++) {
    const y = i * plankHeight + plankHeight;
    // Darker gap line
    ctx.fillStyle = BROWN_MED;
    ctx.fillRect(0, y, TILE, 1);
    // Slight shade variation per plank
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(0, y - plankHeight, TILE, plankHeight);
    }
  }

  // Vertical plank end joints (staggered)
  ctx.fillStyle = BROWN_MED;
  for (let i = 0; i < 5; i++) {
    const xOff = i % 2 === 0 ? 10 : 22;
    const y = i * plankHeight;
    ctx.fillRect(xOff, y, 1, plankHeight + 1);
  }

  applyHologramTint(ctx, mode);
}

// ========== Fence ==========

function drawFenceBase(ctx: CanvasRenderingContext2D): void {
  // Two vertical posts
  const postW = 4;
  const postH = 28;
  const postY = 2;

  ctx.fillStyle = FENCE_POST;
  ctx.fillRect(6, postY, postW, postH);
  ctx.fillRect(22, postY, postW, postH);

  // Post highlights
  ctx.fillStyle = BROWN_LIGHT;
  ctx.fillRect(7, postY + 1, 1, postH - 2);
  ctx.fillRect(23, postY + 1, 1, postH - 2);

  // Two horizontal rails
  ctx.fillStyle = FENCE_RAIL;
  ctx.fillRect(6, 9, 20, 3);
  ctx.fillRect(6, 20, 20, 3);

  // Rail highlights
  ctx.fillStyle = BROWN_HIGHLIGHT;
  ctx.fillRect(7, 9, 18, 1);
  ctx.fillRect(7, 20, 18, 1);

  // Post caps (slightly wider)
  ctx.fillStyle = BROWN_DARK;
  ctx.fillRect(5, postY, postW + 2, 2);
  ctx.fillRect(21, postY, postW + 2, 2);
}

export function drawFence(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  applyMode(ctx, mode);
  drawFenceBase(ctx);
  applyHologramTint(ctx, mode);
}

// ========== Fence Gate ==========

export function drawFenceGate(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  isOpen: boolean,
): void {
  applyMode(ctx, mode);

  const postW = 4;
  const postH = 28;
  const postY = 2;

  // Two posts
  ctx.fillStyle = FENCE_POST;
  ctx.fillRect(4, postY, postW, postH);
  ctx.fillRect(24, postY, postW, postH);

  // Post highlights
  ctx.fillStyle = BROWN_LIGHT;
  ctx.fillRect(5, postY + 1, 1, postH - 2);
  ctx.fillRect(25, postY + 1, 1, postH - 2);

  // Post caps
  ctx.fillStyle = BROWN_DARK;
  ctx.fillRect(3, postY, postW + 2, 2);
  ctx.fillRect(23, postY, postW + 2, 2);

  if (isOpen) {
    // Open: short stubs on left hinge side only
    ctx.fillStyle = FENCE_RAIL;
    ctx.fillRect(4, 9, 6, 3);
    ctx.fillRect(4, 20, 6, 3);
    // Hinge dots
    ctx.fillStyle = LATCH_COLOR;
    ctx.fillRect(8, 10, 2, 1);
    ctx.fillRect(8, 21, 2, 1);
  } else {
    // Closed: full rails with latch
    ctx.fillStyle = FENCE_RAIL;
    ctx.fillRect(4, 9, 24, 3);
    ctx.fillRect(4, 20, 24, 3);

    // Rail highlights
    ctx.fillStyle = BROWN_HIGHLIGHT;
    ctx.fillRect(5, 9, 22, 1);
    ctx.fillRect(5, 20, 22, 1);

    // Hinge on left
    ctx.fillStyle = LATCH_COLOR;
    ctx.fillRect(8, 10, 2, 1);
    ctx.fillRect(8, 21, 2, 1);

    // Latch on right
    ctx.fillStyle = LATCH_COLOR;
    ctx.fillRect(22, 14, 3, 2);
  }

  applyHologramTint(ctx, mode);
}

// ========== Graphic builders ==========

type DrawFn = (ctx: CanvasRenderingContext2D, mode: SpriteMode, isOpen: boolean) => void;

const DRAW_MAP: Record<string, DrawFn> = {
  wall: (ctx, mode) => drawWall(ctx, mode),
  wall_window: (ctx, mode) => drawWallWindow(ctx, mode),
  wall_door: (ctx, mode, isOpen) => drawWallDoor(ctx, mode, isOpen),
  floor: (ctx, mode) => drawFloor(ctx, mode),
  fence: (ctx, mode) => drawFence(ctx, mode),
  fence_gate: (ctx, mode, isOpen) => drawFenceGate(ctx, mode, isOpen),
};

/**
 * Create an Excalibur Canvas graphic for a building type.
 */
export function buildingGraphic(typeId: string, mode: SpriteMode, isOpen = false): ex.Canvas {
  const canvas = new ex.Canvas({
    width: TILE,
    height: TILE,
    cache: true,
    draw: (ctx) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, TILE, TILE);
      const fn = DRAW_MAP[typeId];
      if (fn) fn(ctx, mode, isOpen);
    },
  });
  return canvas;
}
