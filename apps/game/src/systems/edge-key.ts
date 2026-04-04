/**
 * Edge key encoding/decoding for walls and fences placed between tiles.
 *
 * An "edge" is the boundary between two adjacent tiles. Each edge gets a unique
 * numeric key for O(1) Set/Map lookups.
 *
 * - Horizontal edges separate vertically adjacent tiles: (x, y) and (x, y+1).
 *   Encoded as hEdgeKey(x, y) = y * MAP_COLS + x.
 * - Vertical edges separate horizontally adjacent tiles: (x, y) and (x+1, y).
 *   Encoded as vEdgeKey(x, y) = H_EDGE_COUNT + y * V_COLS + x.
 */

const MAP_COLS = 64;
const MAP_ROWS = 64;
const TILE_SIZE = 32;

/** Number of horizontal edge rows (between 64 tile rows → 63 internal edges). */
const H_ROWS = MAP_ROWS - 1; // 63
/** Number of horizontal edges: 63 rows × 64 columns. */
const H_EDGE_COUNT = H_ROWS * MAP_COLS; // 4032

/** Number of vertical edge columns (between 64 tile cols → 63 internal edges). */
const V_COLS = MAP_COLS - 1; // 63

export type EdgeAxis = "h" | "v";

export type EdgeOrientation = "N" | "E" | "S" | "W";

export interface DecodedEdge {
  x: number;
  y: number;
  axis: EdgeAxis;
}

export interface FenceConnections {
  startConnected: boolean; // left (h) or top (v)
  endConnected: boolean; // right (h) or bottom (v)
}

export const DEFAULT_CONNECTIONS: FenceConnections = {
  startConnected: false,
  endConnected: false,
};

// ─── Validation ──────────────────────────────────────────────────

function isValidH(x: number, y: number): boolean {
  return x >= 0 && x < MAP_COLS && y >= 0 && y < H_ROWS;
}

function isValidV(x: number, y: number): boolean {
  return x >= 0 && x < V_COLS && y >= 0 && y < MAP_ROWS;
}

// ─── Encoding ────────────────────────────────────────────────────

/** Horizontal edge between tile (x, y) and tile (x, y+1). */
export function hEdgeKey(x: number, y: number): number {
  return y * MAP_COLS + x;
}

/** Vertical edge between tile (x, y) and tile (x+1, y). */
export function vEdgeKey(x: number, y: number): number {
  return H_EDGE_COUNT + y * V_COLS + x;
}

// ─── Decoding ────────────────────────────────────────────────────

export function decodeEdgeKey(key: number): DecodedEdge {
  if (key < H_EDGE_COUNT) {
    return {
      x: key % MAP_COLS,
      y: Math.floor(key / MAP_COLS),
      axis: "h",
    };
  }
  const vk = key - H_EDGE_COUNT;
  return {
    x: vk % V_COLS,
    y: Math.floor(vk / V_COLS),
    axis: "v",
  };
}

// ─── Movement helpers ────────────────────────────────────────────

/**
 * Return the edge key crossed when moving from (fromX, fromY) to (toX, toY),
 * or null if the movement is diagonal, stationary, or crosses a map boundary
 * where no edge can be placed.
 */
export function edgeKeyBetween(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === -1) {
    // Moving north: cross the horizontal edge at (x, y-1)
    return isValidH(fromX, fromY - 1) ? hEdgeKey(fromX, fromY - 1) : null;
  }
  if (dx === 0 && dy === 1) {
    // Moving south: cross the horizontal edge at (x, y)
    return isValidH(fromX, fromY) ? hEdgeKey(fromX, fromY) : null;
  }
  if (dx === -1 && dy === 0) {
    // Moving west: cross the vertical edge at (x-1, y)
    return isValidV(fromX - 1, fromY) ? vEdgeKey(fromX - 1, fromY) : null;
  }
  if (dx === 1 && dy === 0) {
    // Moving east: cross the vertical edge at (x, y)
    return isValidV(fromX, fromY) ? vEdgeKey(fromX, fromY) : null;
  }
  return null;
}

/**
 * Given a tile position and a compass direction, return the edge key on that
 * side of the tile (for the placement cursor).
 */
export function edgeKeyFromTileAndDir(
  tileX: number,
  tileY: number,
  dir: EdgeOrientation,
): number | null {
  switch (dir) {
    case "N":
      return isValidH(tileX, tileY - 1) ? hEdgeKey(tileX, tileY - 1) : null;
    case "S":
      return isValidH(tileX, tileY) ? hEdgeKey(tileX, tileY) : null;
    case "W":
      return isValidV(tileX - 1, tileY) ? vEdgeKey(tileX - 1, tileY) : null;
    case "E":
      return isValidV(tileX, tileY) ? vEdgeKey(tileX, tileY) : null;
  }
}

// ─── World positioning ───────────────────────────────────────────

/**
 * Pixel position at the midpoint of an edge (for actor placement).
 * - Horizontal edge (x, y): center of boundary between row y and row y+1.
 * - Vertical edge (x, y): center of boundary between col x and col x+1.
 */
export function edgeToWorldPos(x: number, y: number, axis: EdgeAxis): { wx: number; wy: number } {
  if (axis === "h") {
    return {
      wx: (x + 0.5) * TILE_SIZE,
      wy: (y + 1) * TILE_SIZE,
    };
  }
  return {
    wx: (x + 1) * TILE_SIZE,
    wy: (y + 0.5) * TILE_SIZE,
  };
}

// ─── Neighbor edges (for fence autotile) ─────────────────────────

/**
 * Return all edge keys that share an endpoint with the given edge.
 * Used to refresh fence connections when a fence is placed or removed.
 *
 * For horizontal edge hEdgeKey(x, y):
 *   Left endpoint (grid point (x, y+1)):
 *     hEdgeKey(x-1, y), vEdgeKey(x-1, y), vEdgeKey(x-1, y+1)
 *   Right endpoint (grid point (x+1, y+1)):
 *     hEdgeKey(x+1, y), vEdgeKey(x, y), vEdgeKey(x, y+1)
 *
 * For vertical edge vEdgeKey(x, y):
 *   Top endpoint (grid point (x+1, y)):
 *     vEdgeKey(x, y-1), hEdgeKey(x, y-1), hEdgeKey(x+1, y-1)
 *   Bottom endpoint (grid point (x+1, y+1)):
 *     vEdgeKey(x, y+1), hEdgeKey(x, y), hEdgeKey(x+1, y)
 */
export interface EdgeNeighbors {
  /** Edge keys sharing the start endpoint (left for h, top for v). */
  start: number[];
  /** Edge keys sharing the end endpoint (right for h, bottom for v). */
  end: number[];
}

export function getEdgeNeighbors(x: number, y: number, axis: EdgeAxis): EdgeNeighbors {
  const start: number[] = [];
  const end: number[] = [];

  if (axis === "h") {
    // Left endpoint neighbors
    if (isValidH(x - 1, y)) start.push(hEdgeKey(x - 1, y));
    if (isValidV(x - 1, y)) start.push(vEdgeKey(x - 1, y));
    if (isValidV(x - 1, y + 1)) start.push(vEdgeKey(x - 1, y + 1));
    // Right endpoint neighbors
    if (isValidH(x + 1, y)) end.push(hEdgeKey(x + 1, y));
    if (isValidV(x, y)) end.push(vEdgeKey(x, y));
    if (isValidV(x, y + 1)) end.push(vEdgeKey(x, y + 1));
  } else {
    // Top endpoint neighbors
    if (isValidV(x, y - 1)) start.push(vEdgeKey(x, y - 1));
    if (isValidH(x, y - 1)) start.push(hEdgeKey(x, y - 1));
    if (isValidH(x + 1, y - 1)) start.push(hEdgeKey(x + 1, y - 1));
    // Bottom endpoint neighbors
    if (isValidV(x, y + 1)) end.push(vEdgeKey(x, y + 1));
    if (isValidH(x, y)) end.push(hEdgeKey(x, y));
    if (isValidH(x + 1, y)) end.push(hEdgeKey(x + 1, y));
  }

  return { start, end };
}
