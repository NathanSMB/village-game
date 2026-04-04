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
const DOOR_KNOB = "#d4a850";
const FENCE_POST = "#5c3a10";
const FENCE_RAIL = "#7a5020";
const LATCH_COLOR = "#888888";

// Stone color palette (fire pit, hearth)
const STONE_DARK = "#4a4a4a";
const STONE_MED = "#6b6b6b";
const STONE_LIGHT = "#8b8b8b";
const STONE_HIGHLIGHT = "#a0a0a0";
const CHARCOAL = "#2a2a2a";
const ASH_GRAY = "#555555";

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
  // Open gap in the center (like a glassless window opening)
  const winW = 8;
  const winH = WALL_THICKNESS;
  const winX = (TILE - winW) / 2;

  // Clear the gap to transparency
  ctx.clearRect(winX, 0, winW, winH);

  // Thin frame on left and right edges of the gap
  ctx.fillStyle = BROWN_DARK;
  ctx.fillRect(winX, 0, 1, winH);
  ctx.fillRect(winX + winW - 1, 0, 1, winH);
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

// ========== Bed (tile-based) ==========

/**
 * Sheet color for the bed.  The default gray matches the "Gray" clothing
 * palette ({r:100, g:100, b:105}).  To support future dyeing, every shade
 * used on the sheets is derived from this single base — swap it to change
 * the entire colour.
 */
interface RGB {
  r: number;
  g: number;
  b: number;
}

const DEFAULT_SHEET_COLOR: RGB = { r: 100, g: 100, b: 105 };

function darkenRgb(c: RGB, amount: number): string {
  const f = 1 - amount;
  return `rgb(${Math.round(c.r * f)},${Math.round(c.g * f)},${Math.round(c.b * f)})`;
}

function lightenRgb(c: RGB, amount: number): string {
  const r = Math.round(c.r + (255 - c.r) * amount);
  const g = Math.round(c.g + (255 - c.g) * amount);
  const b = Math.round(c.b + (255 - c.b) * amount);
  return `rgb(${r},${g},${b})`;
}

function rgbStr(c: RGB): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

export function drawBed(
  ctx: CanvasRenderingContext2D,
  mode: SpriteMode,
  _isOpen = false,
  sheetColor: RGB = DEFAULT_SHEET_COLOR,
): void {
  applyMode(ctx, mode);

  const S = TILE; // 32

  // --- Wooden frame ---
  // Outer frame border
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(0, 0, S, S);

  // Frame fill
  ctx.fillStyle = BROWN_MED;
  ctx.fillRect(1, 1, S - 2, S - 2);

  // --- Headboard (top 7px) ---
  ctx.fillStyle = BROWN_DARK;
  ctx.fillRect(1, 1, S - 2, 7);
  // Headboard plank highlight
  ctx.fillStyle = BROWN_LIGHT;
  ctx.fillRect(3, 2, S - 6, 1);
  ctx.fillRect(3, 5, S - 6, 1);
  // Bedposts (top corners)
  ctx.fillStyle = BROWN_HIGHLIGHT;
  ctx.fillRect(2, 1, 2, 7);
  ctx.fillRect(S - 4, 1, 2, 7);

  // --- Mattress area ---
  const mattY = 8;
  const mattH = S - mattY - 2; // stop 2px from bottom for footboard
  const mattX = 2;
  const mattW = S - 4;

  // Mattress base (light tan)
  ctx.fillStyle = "#d4c4a0";
  ctx.fillRect(mattX, mattY, mattW, mattH);

  // --- Pillow (near headboard) ---
  const pillowY = mattY + 1;
  const pillowH = 4;
  const pillowX = mattX + 3;
  const pillowW = mattW - 6;
  // Pillow shadow
  ctx.fillStyle = lightenRgb(sheetColor, 0.45);
  ctx.fillRect(pillowX, pillowY, pillowW, pillowH);
  // Pillow highlight
  ctx.fillStyle = lightenRgb(sheetColor, 0.6);
  ctx.fillRect(pillowX + 1, pillowY, pillowW - 2, pillowH - 1);
  // Pillow divider (two pillows)
  ctx.fillStyle = lightenRgb(sheetColor, 0.3);
  ctx.fillRect(mattX + mattW / 2, pillowY, 1, pillowH);

  // --- Sheets / blanket ---
  const sheetY = pillowY + pillowH + 1;
  const sheetH = mattY + mattH - sheetY;
  const sheetX = mattX;
  const sheetW = mattW;

  // Sheet base color
  ctx.fillStyle = rgbStr(sheetColor);
  ctx.fillRect(sheetX, sheetY, sheetW, sheetH);

  // Fold lines (subtle wrinkles)
  ctx.fillStyle = darkenRgb(sheetColor, 0.2);
  ctx.fillRect(sheetX + 4, sheetY, 1, sheetH);
  ctx.fillRect(sheetX + sheetW - 5, sheetY, 1, sheetH);
  // Horizontal fold near center
  ctx.fillRect(sheetX, sheetY + Math.floor(sheetH / 2), sheetW, 1);

  // Sheet highlight (top edge of blanket)
  ctx.fillStyle = lightenRgb(sheetColor, 0.2);
  ctx.fillRect(sheetX + 1, sheetY, sheetW - 2, 1);

  // Sheet shadow (bottom edge)
  ctx.fillStyle = darkenRgb(sheetColor, 0.3);
  ctx.fillRect(sheetX, sheetY + sheetH - 1, sheetW, 1);

  // --- Footboard (bottom 2px) ---
  ctx.fillStyle = BROWN_DARK;
  ctx.fillRect(1, S - 2, S - 2, 1);
  // Footboard posts
  ctx.fillStyle = BROWN_HIGHLIGHT;
  ctx.fillRect(2, S - 3, 2, 2);
  ctx.fillRect(S - 4, S - 3, 2, 2);

  applyHologramTint(ctx, mode, S, S);
}

// ========== Camp Fire (tile-based) ==========

export function drawCampFire(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  applyMode(ctx, mode);
  const S = TILE;
  const cx = S / 2;
  const cy = S / 2 + 2;

  // Ash circle at base
  ctx.fillStyle = ASH_GRAY;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CHARCOAL;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Branches in tepee arrangement (5 sticks converging at center-top)
  const stickEnds = [
    { x: cx - 8, y: cy + 6 },
    { x: cx + 8, y: cy + 6 },
    { x: cx - 6, y: cy + 7 },
    { x: cx + 6, y: cy + 7 },
    { x: cx, y: cy + 8 },
  ];
  const tipY = cy - 5;

  ctx.strokeStyle = BROWN_DARK;
  ctx.lineWidth = 1.5;
  for (const end of stickEnds) {
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(cx + (end.x - cx) * 0.15, tipY);
    ctx.stroke();
  }

  // Lighter stick highlights
  ctx.strokeStyle = BROWN_LIGHT;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy + 6);
  ctx.lineTo(cx - 1, tipY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 7, cy + 6);
  ctx.lineTo(cx + 1, tipY);
  ctx.stroke();

  applyHologramTint(ctx, mode, S, S);
}

// ========== Fire Pit (tile-based) ==========

export function drawFirePit(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  applyMode(ctx, mode);
  const S = TILE;
  const cx = S / 2;
  const cy = S / 2;

  // Dark charcoal interior
  ctx.fillStyle = CHARCOAL;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ash layer
  ctx.fillStyle = ASH_GRAY;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ring of 5 stones around the pit
  const stonePositions = [
    { x: cx, y: cy - 9 },
    { x: cx + 8, y: cy - 3 },
    { x: cx + 5, y: cy + 7 },
    { x: cx - 5, y: cy + 7 },
    { x: cx - 8, y: cy - 3 },
  ];

  for (let i = 0; i < stonePositions.length; i++) {
    const sp = stonePositions[i];
    const w = 4 + (i % 2);
    const h = 3 + ((i + 1) % 2);

    // Stone body
    ctx.fillStyle = STONE_MED;
    ctx.fillRect(sp.x - w / 2, sp.y - h / 2, w, h);

    // Stone highlight (top-left pixel)
    ctx.fillStyle = STONE_HIGHLIGHT;
    ctx.fillRect(sp.x - w / 2, sp.y - h / 2, 1, 1);

    // Stone shadow (bottom-right pixel)
    ctx.fillStyle = STONE_DARK;
    ctx.fillRect(sp.x + w / 2 - 1, sp.y + h / 2 - 1, 1, 1);
  }

  applyHologramTint(ctx, mode, S, S);
}

// ========== Hearth (tile-based) ==========

export function drawHearth(ctx: CanvasRenderingContext2D, mode: SpriteMode): void {
  applyMode(ctx, mode);
  const S = TILE;
  const wallW = 7; // side wall thickness
  const backH = 9; // back wall height

  // Outer outline (fills entire tile)
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(0, 0, S, S);

  // Back wall (top stones) — full width
  ctx.fillStyle = STONE_MED;
  ctx.fillRect(1, 1, S - 2, backH);
  // Back wall highlight
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(2, 2, S - 4, 2);
  // Back wall dark top/bottom lines
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(0, 0, S, 1);
  ctx.fillRect(0, backH, S, 1);

  // Stone block lines on back wall
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(8, 1, 1, backH);
  ctx.fillRect(16, 1, 1, backH);
  ctx.fillRect(24, 1, 1, backH);

  // Left wall — full height
  ctx.fillStyle = STONE_MED;
  ctx.fillRect(0, 0, wallW, S);
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(1, 1, 2, S - 2);
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(0, 0, 1, S);
  ctx.fillRect(wallW, 0, 1, S);

  // Left wall block lines
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(0, 11, wallW, 1);
  ctx.fillRect(0, 21, wallW, 1);

  // Right wall — full height
  ctx.fillStyle = STONE_MED;
  ctx.fillRect(S - wallW, 0, wallW, S);
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(S - wallW + 1, 1, 2, S - 2);
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(S - wallW - 1, 0, 1, S);
  ctx.fillRect(S - 1, 0, 1, S);

  // Right wall block lines
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(S - wallW, 11, wallW, 1);
  ctx.fillRect(S - wallW, 21, wallW, 1);

  // Interior (charcoal fill)
  ctx.fillStyle = CHARCOAL;
  ctx.fillRect(wallW + 1, backH + 1, S - wallW * 2 - 2, S - backH - 1);

  // Ash layer inside
  ctx.fillStyle = ASH_GRAY;
  ctx.fillRect(wallW + 3, backH + 4, S - wallW * 2 - 6, S - backH - 6);

  // Front lip (bottom stone edge — full width)
  ctx.fillStyle = STONE_MED;
  ctx.fillRect(wallW + 1, S - 3, S - wallW * 2 - 2, 3);
  ctx.fillStyle = STONE_HIGHLIGHT;
  ctx.fillRect(wallW + 2, S - 3, S - wallW * 2 - 4, 1);
  ctx.fillStyle = STONE_DARK;
  ctx.fillRect(wallW + 1, S - 1, S - wallW * 2 - 2, 1);

  applyHologramTint(ctx, mode, S, S);
}

// ========== Graphic builders ==========

// --- Tile-based (floor only) ---

type TileDrawFn = (ctx: CanvasRenderingContext2D, mode: SpriteMode, isOpen: boolean) => void;

const TILE_DRAW_MAP: Record<string, TileDrawFn> = {
  floor: (ctx, mode) => drawFloor(ctx, mode),
  bed: (ctx, mode, isOpen) => drawBed(ctx, mode, isOpen),
  camp_fire: (ctx, mode) => drawCampFire(ctx, mode),
  fire_pit: (ctx, mode) => drawFirePit(ctx, mode),
  hearth: (ctx, mode) => drawHearth(ctx, mode),
};

/**
 * Create an Excalibur Canvas graphic for a tile-based building type.
 * @param rotation  0-3 clockwise quarter-turns applied around the tile centre.
 */
export function buildingGraphic(
  typeId: string,
  mode: SpriteMode,
  isOpen = false,
  rotation = 0,
): ex.Canvas {
  const canvas = new ex.Canvas({
    width: TILE,
    height: TILE,
    cache: true,
    draw: (ctx) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, TILE, TILE);

      if (rotation !== 0) {
        ctx.save();
        ctx.translate(TILE / 2, TILE / 2);
        ctx.rotate((rotation * Math.PI) / 2);
        ctx.translate(-TILE / 2, -TILE / 2);
      }

      const fn = TILE_DRAW_MAP[typeId];
      if (fn) fn(ctx, mode, isOpen);

      if (rotation !== 0) {
        ctx.restore();
      }
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
