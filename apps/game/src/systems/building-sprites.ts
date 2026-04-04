import * as ex from "excalibur";
import type { EdgeAxis, FenceConnections } from "./edge-key.ts";

const TILE = 32;
const WALL_THICKNESS = 8;

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

function applyHologramTint(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  w: number,
  h: number,
): void {
  if (mode === "hologram" || mode === "ghost") {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = HOLO_CYAN;
    ctx.globalAlpha = mode === "hologram" ? 0.35 : 0.4;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
}

// ========== Floor (tile-based, unchanged) ==========

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

  applyHologramTint(ctx, mode, TILE, TILE);
}

// ========== Edge-based wall drawing helpers ==========

/**
 * Draw a horizontal wall strip (TILE wide × WALL_THICKNESS tall).
 * For vertical walls, the caller rotates the canvas.
 */
function drawHWallStrip(ctx: CanvasRenderingContext2D): void {
  const w = TILE;
  const h = WALL_THICKNESS;

  // Base fill
  ctx.fillStyle = BROWN_MED;
  ctx.fillRect(0, 0, w, h);

  // Horizontal log lines
  ctx.fillStyle = BROWN_DARK;
  ctx.fillRect(0, 1, w, 1);
  ctx.fillRect(0, 4, w, 1);

  // Lighter highlights
  ctx.fillStyle = BROWN_LIGHT;
  ctx.fillRect(1, 2, w - 2, 1);
  ctx.fillRect(1, 6, w - 2, 1);

  // Outline
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

// ========== Edge Wall ==========

export function drawEdgeWall(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  axis: EdgeAxis,
): void {
  applyMode(ctx, mode);
  if (axis === "h") {
    drawHWallStrip(ctx);
    applyHologramTint(ctx, mode, TILE, WALL_THICKNESS);
  } else {
    // Rotate to draw vertical: swap coordinates
    ctx.save();
    ctx.translate(WALL_THICKNESS, 0);
    ctx.rotate(Math.PI / 2);
    drawHWallStrip(ctx);
    ctx.restore();
    applyHologramTint(ctx, mode, WALL_THICKNESS, TILE);
  }
}

// ========== Edge Wall with Window ==========

function drawHWallWindowOverlay(ctx: CanvasRenderingContext2D): void {
  // Small window cutout in the center of the strip
  const winW = 6;
  const winH = 4;
  const winX = (TILE - winW) / 2;
  const winY = (WALL_THICKNESS - winH) / 2;

  ctx.fillStyle = WINDOW_BG;
  ctx.fillRect(winX, winY, winW, winH);

  // Frame
  ctx.strokeStyle = BROWN_PLANK;
  ctx.lineWidth = 1;
  ctx.strokeRect(winX + 0.5, winY + 0.5, winW - 1, winH - 1);

  // Cross mullion
  ctx.fillStyle = BROWN_PLANK;
  ctx.fillRect(winX + Math.floor(winW / 2) - 0.5, winY, 1, winH);
  ctx.fillRect(winX, winY + Math.floor(winH / 2) - 0.5, winW, 1);
}

export function drawEdgeWallWindow(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  axis: EdgeAxis,
): void {
  applyMode(ctx, mode);
  if (axis === "h") {
    drawHWallStrip(ctx);
    drawHWallWindowOverlay(ctx);
    applyHologramTint(ctx, mode, TILE, WALL_THICKNESS);
  } else {
    ctx.save();
    ctx.translate(WALL_THICKNESS, 0);
    ctx.rotate(Math.PI / 2);
    drawHWallStrip(ctx);
    drawHWallWindowOverlay(ctx);
    ctx.restore();
    applyHologramTint(ctx, mode, WALL_THICKNESS, TILE);
  }
}

// ========== Edge Wall with Door ==========

function drawHWallDoorOverlay(ctx: CanvasRenderingContext2D, isOpen: boolean): void {
  const doorW = 12;
  const doorH = WALL_THICKNESS;
  const doorX = (TILE - doorW) / 2;
  const doorY = 0;

  if (isOpen) {
    // Open: transparent gap
    ctx.clearRect(doorX, doorY, doorW, doorH);
    // Thin frame on left and right edges of gap
    ctx.fillStyle = BROWN_DARK;
    ctx.fillRect(doorX, doorY, 1, doorH);
    ctx.fillRect(doorX + doorW - 1, doorY, 1, doorH);
  } else {
    // Closed: door planks
    ctx.fillStyle = BROWN_PLANK;
    ctx.fillRect(doorX, doorY, doorW, doorH);
    // Plank dividers
    ctx.fillStyle = BROWN_HIGHLIGHT;
    ctx.fillRect(doorX + 3, doorY + 1, 1, doorH - 2);
    ctx.fillRect(doorX + 8, doorY + 1, 1, doorH - 2);
    // Knob
    ctx.fillStyle = DOOR_KNOB;
    ctx.fillRect(doorX + doorW - 3, Math.floor(doorH / 2) - 1, 2, 2);
    // Frame
    ctx.strokeStyle = BROWN_DARK;
    ctx.lineWidth = 1;
    ctx.strokeRect(doorX + 0.5, doorY + 0.5, doorW - 1, doorH - 1);
  }
}

export function drawEdgeWallDoor(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  axis: EdgeAxis,
  isOpen: boolean,
): void {
  applyMode(ctx, mode);
  if (axis === "h") {
    drawHWallStrip(ctx);
    drawHWallDoorOverlay(ctx, isOpen);
    applyHologramTint(ctx, mode, TILE, WALL_THICKNESS);
  } else {
    ctx.save();
    ctx.translate(WALL_THICKNESS, 0);
    ctx.rotate(Math.PI / 2);
    drawHWallStrip(ctx);
    drawHWallDoorOverlay(ctx, isOpen);
    ctx.restore();
    applyHologramTint(ctx, mode, WALL_THICKNESS, TILE);
  }
}

// ========== Edge Fence ==========

/**
 * Draw a horizontal fence strip. Posts appear at unconnected endpoints.
 * For vertical, caller rotates the canvas.
 */
function drawHFenceStrip(ctx: CanvasRenderingContext2D, connections: FenceConnections): void {
  const w = TILE;
  const h = WALL_THICKNESS;
  const postW = 4;
  const railY1 = 1;
  const railY2 = 5;
  const railH = 2;

  // Two horizontal rails spanning the full width
  ctx.fillStyle = FENCE_RAIL;
  ctx.fillRect(0, railY1, w, railH);
  ctx.fillRect(0, railY2, w, railH);

  // Rail highlights
  ctx.fillStyle = BROWN_HIGHLIGHT;
  ctx.fillRect(1, railY1, w - 2, 1);
  ctx.fillRect(1, railY2, w - 2, 1);

  // Start (left) post — only if NOT connected
  if (!connections.startConnected) {
    ctx.fillStyle = FENCE_POST;
    ctx.fillRect(0, 0, postW, h);
    ctx.fillStyle = BROWN_LIGHT;
    ctx.fillRect(1, 1, 1, h - 2);
    // Post cap
    ctx.fillStyle = BROWN_DARK;
    ctx.fillRect(0, 0, postW, 1);
  }

  // End (right) post — only if NOT connected
  if (!connections.endConnected) {
    ctx.fillStyle = FENCE_POST;
    ctx.fillRect(w - postW, 0, postW, h);
    ctx.fillStyle = BROWN_LIGHT;
    ctx.fillRect(w - postW + 1, 1, 1, h - 2);
    // Post cap
    ctx.fillStyle = BROWN_DARK;
    ctx.fillRect(w - postW, 0, postW, 1);
  }
}

export function drawEdgeFence(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  axis: EdgeAxis,
  connections: FenceConnections,
): void {
  applyMode(ctx, mode);
  if (axis === "h") {
    drawHFenceStrip(ctx, connections);
    applyHologramTint(ctx, mode, TILE, WALL_THICKNESS);
  } else {
    ctx.save();
    ctx.translate(WALL_THICKNESS, 0);
    ctx.rotate(Math.PI / 2);
    drawHFenceStrip(ctx, connections);
    ctx.restore();
    applyHologramTint(ctx, mode, WALL_THICKNESS, TILE);
  }
}

// ========== Edge Fence Gate ==========

function drawHFenceGateStrip(ctx: CanvasRenderingContext2D, isOpen: boolean): void {
  const w = TILE;
  const h = WALL_THICKNESS;
  const postW = 4;
  const railY1 = 1;
  const railY2 = 5;
  const railH = 2;

  // Two posts always present (gate hinges)
  ctx.fillStyle = FENCE_POST;
  ctx.fillRect(0, 0, postW, h);
  ctx.fillRect(w - postW, 0, postW, h);

  // Post highlights
  ctx.fillStyle = BROWN_LIGHT;
  ctx.fillRect(1, 1, 1, h - 2);
  ctx.fillRect(w - postW + 1, 1, 1, h - 2);

  // Post caps
  ctx.fillStyle = BROWN_DARK;
  ctx.fillRect(0, 0, postW, 1);
  ctx.fillRect(w - postW, 0, postW, 1);

  if (isOpen) {
    // Open: short stubs from left hinge
    ctx.fillStyle = FENCE_RAIL;
    ctx.fillRect(postW, railY1, 6, railH);
    ctx.fillRect(postW, railY2, 6, railH);
    // Hinge dots
    ctx.fillStyle = LATCH_COLOR;
    ctx.fillRect(postW + 1, railY1, 1, 1);
    ctx.fillRect(postW + 1, railY2, 1, 1);
  } else {
    // Closed: full rails between posts
    const railStart = postW;
    const railLen = w - postW * 2;
    ctx.fillStyle = FENCE_RAIL;
    ctx.fillRect(railStart, railY1, railLen, railH);
    ctx.fillRect(railStart, railY2, railLen, railH);

    // Rail highlights
    ctx.fillStyle = BROWN_HIGHLIGHT;
    ctx.fillRect(railStart + 1, railY1, railLen - 2, 1);
    ctx.fillRect(railStart + 1, railY2, railLen - 2, 1);

    // Hinge on left
    ctx.fillStyle = LATCH_COLOR;
    ctx.fillRect(postW + 1, railY1, 1, 1);
    ctx.fillRect(postW + 1, railY2, 1, 1);

    // Latch in center
    ctx.fillStyle = LATCH_COLOR;
    ctx.fillRect(Math.floor(w / 2) - 1, 3, 2, 2);
  }
}

export function drawEdgeFenceGate(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  axis: EdgeAxis,
  isOpen: boolean,
): void {
  applyMode(ctx, mode);
  if (axis === "h") {
    drawHFenceGateStrip(ctx, isOpen);
    applyHologramTint(ctx, mode, TILE, WALL_THICKNESS);
  } else {
    ctx.save();
    ctx.translate(WALL_THICKNESS, 0);
    ctx.rotate(Math.PI / 2);
    drawHFenceGateStrip(ctx, isOpen);
    ctx.restore();
    applyHologramTint(ctx, mode, WALL_THICKNESS, TILE);
  }
}

// ========== Graphic builders ==========

// --- Tile-based (floor only) ---

type TileDrawFn = (ctx: CanvasRenderingContext2D, mode: SpriteMode, isOpen: boolean) => void;

const TILE_DRAW_MAP: Record<string, TileDrawFn> = {
  floor: (ctx, mode) => drawFloor(ctx, mode),
};

/**
 * Create an Excalibur Canvas graphic for a tile-based building type (floor).
 */
export function buildingGraphic(typeId: string, mode: SpriteMode, isOpen = false): ex.Canvas {
  const canvas = new ex.Canvas({
    width: TILE,
    height: TILE,
    cache: true,
    draw: (ctx) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, TILE, TILE);
      const fn = TILE_DRAW_MAP[typeId];
      if (fn) fn(ctx, mode, isOpen);
    },
  });
  return canvas;
}

// --- Edge-based (walls, fences) ---

type EdgeDrawFn = (
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  axis: EdgeAxis,
  isOpen: boolean,
  connections: FenceConnections,
) => void;

const EDGE_DRAW_MAP: Record<string, EdgeDrawFn> = {
  wall: (ctx, mode, axis) => drawEdgeWall(ctx, mode, axis),
  wall_window: (ctx, mode, axis) => drawEdgeWallWindow(ctx, mode, axis),
  wall_door: (ctx, mode, axis, isOpen) => drawEdgeWallDoor(ctx, mode, axis, isOpen),
  fence: (ctx, mode, axis, _isOpen, conn) => drawEdgeFence(ctx, mode, axis, conn),
  fence_gate: (ctx, mode, axis, isOpen) => drawEdgeFenceGate(ctx, mode, axis, isOpen),
};

/**
 * Create an Excalibur Canvas graphic for an edge-based building type.
 */
export function edgeBuildingGraphic(
  typeId: string,
  mode: SpriteMode,
  axis: EdgeAxis,
  isOpen = false,
  connections: FenceConnections = { startConnected: false, endConnected: false },
): ex.Canvas {
  const isH = axis === "h";
  const w = isH ? TILE : WALL_THICKNESS;
  const h = isH ? WALL_THICKNESS : TILE;
  return new ex.Canvas({
    width: w,
    height: h,
    cache: true,
    draw: (ctx) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      const fn = EDGE_DRAW_MAP[typeId];
      if (fn) fn(ctx, mode, axis, isOpen, connections);
    },
  });
}

export { WALL_THICKNESS };
