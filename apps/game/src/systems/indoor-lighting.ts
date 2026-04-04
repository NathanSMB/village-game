/**
 * Indoor lighting / darkness system.
 *
 * When floor tiles form a fully enclosed room (all perimeter edges walled),
 * the room is darkened with a semi-transparent overlay. Windows and open doors
 * project light inward with gradient falloff.
 */
import * as ex from "excalibur";
import type { Building } from "../actors/building.ts";
import type { EdgeBuilding } from "../actors/edge-building.ts";
import { edgeKeyBetween } from "./edge-key.ts";

const MAP_COLS = 64;
const MAP_ROWS = 64;
const TILE_SIZE = 32;

/** Darkness for rooms with no windows/open doors (fully dark). */
const DARK_ROOM = 0.45;
/** Darkness for rooms with at least one window or open door (natural light). */
const LIT_ROOM = 0.2;

/** Wall type IDs that count toward room enclosure. */
const WALL_IDS = new Set(["wall", "wall_window", "wall_door"]);

function tileKey(x: number, y: number): number {
  return y * MAP_COLS + x;
}

function decodeTileKey(key: number): { tx: number; ty: number } {
  return { tx: key % MAP_COLS, ty: Math.floor(key / MAP_COLS) };
}

// Cardinal direction offsets
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

// ─── Enclosure Detection ─────────────────────────────────────────

/**
 * A room is a connected group of completed floor tiles whose every perimeter
 * edge has a completed wall-type edge building (wall, wall_window, wall_door).
 */
interface Room {
  tiles: Set<number>;
}

/**
 * Detect fully enclosed rooms.
 */
function detectRooms(
  buildingByTile: Map<number, Building>,
  edgeBuildings: Map<number, EdgeBuilding>,
): Room[] {
  // Collect all completed floor tile keys
  const floorTiles = new Set<number>();
  for (const [key, b] of buildingByTile) {
    if (b.type.id === "floor" && b.state === "complete") {
      floorTiles.add(key);
    }
  }

  if (floorTiles.size === 0) return [];

  const visited = new Set<number>();
  const rooms: Room[] = [];

  for (const startKey of floorTiles) {
    if (visited.has(startKey)) continue;

    // BFS to find connected component of floor tiles.
    // Closed doors block the flood-fill so that rooms separated by a
    // closed door are treated as independent zones for lighting purposes.
    const component = new Set<number>();
    const queue = [startKey];
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.pop()!;
      component.add(current);
      const { tx, ty } = decodeTileKey(current);

      for (let d = 0; d < 4; d++) {
        const nx = tx + DX[d];
        const ny = ty + DY[d];
        if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) continue;
        const nk = tileKey(nx, ny);
        if (visited.has(nk) || !floorTiles.has(nk)) continue;

        // Don't flood-fill through any wall-type edge (wall, window, closed door).
        // Only open doors allow two floor areas to merge into one room.
        const ek = edgeKeyBetween(tx, ty, nx, ny);
        if (ek != null) {
          const eb = edgeBuildings.get(ek);
          if (eb && eb.state === "complete" && WALL_IDS.has(eb.type.id)) {
            // Allow crossing through open doors only
            if (!(eb.type.id === "wall_door" && eb.isOpen)) {
              continue;
            }
          }
        }

        visited.add(nk);
        queue.push(nk);
      }
    }

    // Check if every perimeter edge has a qualifying wall
    let enclosed = true;
    for (const ck of component) {
      if (!enclosed) break;
      const { tx, ty } = decodeTileKey(ck);
      for (let d = 0; d < 4; d++) {
        const nx = tx + DX[d];
        const ny = ty + DY[d];
        // Neighbor is inside the same room — not a perimeter edge
        if (nx >= 0 && nx < MAP_COLS && ny >= 0 && ny < MAP_ROWS && component.has(tileKey(nx, ny)))
          continue;
        // This is a perimeter edge — needs a wall
        const ek = edgeKeyBetween(tx, ty, nx, ny);
        if (ek == null) {
          // Map boundary with no representable edge → not enclosed
          enclosed = false;
          break;
        }
        const eb = edgeBuildings.get(ek);
        if (!eb || eb.state !== "complete" || !WALL_IDS.has(eb.type.id)) {
          enclosed = false;
          break;
        }
      }
    }

    if (enclosed) {
      rooms.push({ tiles: component });
    }
  }

  return rooms;
}

// ─── Light Calculation ───────────────────────────────────────────

/**
 * For each indoor tile, assign a uniform darkness level per room:
 * - If the room has at least one window or open door → LIT_ROOM
 * - Otherwise → DARK_ROOM
 */
function computeTileDarkness(
  rooms: Room[],
  edgeBuildings: Map<number, EdgeBuilding>,
): Map<number, number> {
  const darkness = new Map<number, number>();

  for (const room of rooms) {
    // Check if the room has any light source (window or open door)
    let hasLight = false;
    for (const tk of room.tiles) {
      if (hasLight) break;
      const { tx, ty } = decodeTileKey(tk);
      for (let d = 0; d < 4; d++) {
        const nx = tx + DX[d];
        const ny = ty + DY[d];
        if (room.tiles.has(tileKey(nx, ny))) continue; // interior edge
        const ek = edgeKeyBetween(tx, ty, nx, ny);
        if (ek == null) continue;
        const eb = edgeBuildings.get(ek);
        if (!eb || eb.state !== "complete") continue;
        if (eb.type.id === "wall_window" || (eb.type.id === "wall_door" && eb.isOpen)) {
          hasLight = true;
          break;
        }
      }
    }

    const level = hasLight ? LIT_ROOM : DARK_ROOM;
    for (const tk of room.tiles) {
      darkness.set(tk, level);
    }
  }

  return darkness;
}

// ─── Darkness Overlay Actor ──────────────────────────────────────

/**
 * A single actor covering the whole map that draws semi-transparent black
 * rectangles over indoor tiles. Z-order is 7 (above edge buildings at z=6,
 * below plan cursor at z=8 and player at z=10).
 */
export class IndoorDarknessOverlay extends ex.Actor {
  private tileDarkness = new Map<number, number>();

  constructor() {
    super({
      pos: ex.vec((MAP_COLS * TILE_SIZE) / 2, (MAP_ROWS * TILE_SIZE) / 2),
      anchor: ex.vec(0.5, 0.5),
      z: 7,
    });
    // Start with an empty graphic
    this.graphics.use(this.buildGraphic());
  }

  /**
   * Recalculate which tiles are indoors and how dark they are, then rebuild
   * the overlay graphic.
   */
  recalculate(
    buildingByTile: Map<number, Building>,
    edgeBuildings: Map<number, EdgeBuilding>,
  ): void {
    const rooms = detectRooms(buildingByTile, edgeBuildings);
    this.tileDarkness = computeTileDarkness(rooms, edgeBuildings);
    this.graphics.use(this.buildGraphic());
  }

  private buildGraphic(): ex.Canvas {
    const tileDarkness = this.tileDarkness;
    const mapW = MAP_COLS * TILE_SIZE;
    const mapH = MAP_ROWS * TILE_SIZE;
    return new ex.Canvas({
      width: mapW,
      height: mapH,
      cache: true,
      draw: (ctx) => {
        ctx.clearRect(0, 0, mapW, mapH);
        for (const [key, d] of tileDarkness) {
          if (d <= 0.005) continue; // skip near-zero
          const tx = key % MAP_COLS;
          const ty = Math.floor(key / MAP_COLS);
          ctx.fillStyle = `rgba(0, 0, 0, ${d})`;
          ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      },
    });
  }
}
