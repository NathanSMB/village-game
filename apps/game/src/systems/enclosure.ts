/**
 * Breeding enclosure detection for creature pens.
 *
 * Distinct from indoor-lighting.ts enclosure detection:
 * - Starts from creature positions (not floor tiles)
 * - ALL completed edge buildings block flood-fill (including open doors/gates)
 * - Natural blockers (water, blocked tiles) also stop the flood-fill
 * - Map boundary reached = not enclosed
 */

import type { EdgeBuilding } from "../actors/edge-building.ts";
import { edgeKeyBetween } from "./edge-key.ts";

const MAP_COLS = 64;
const MAP_ROWS = 64;

function tileKey(x: number, y: number): number {
  return y * MAP_COLS + x;
}

// Cardinal direction offsets
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

export interface Enclosure {
  /** All walkable tiles inside the enclosure. */
  tiles: Set<number>;
  /** Indices into the positions array for creatures inside this enclosure. */
  creatureIndices: number[];
  /** Maximum creature capacity: floor(tiles.size / 3). */
  maxCapacity: number;
}

/**
 * Detect enclosed spaces containing creatures.
 *
 * @param positions  Array of { x, y } tile positions for each creature.
 * @param edgeBuildings  Map of edge key → EdgeBuilding for all placed edge buildings.
 * @param blockedTiles   Set of tile keys that are blocked (trees, rocks, buildings, etc.).
 * @param waterTiles     Set of tile keys that are water.
 * @returns Array of enclosures that contain 2+ creatures with room for more.
 */
export function detectBreedingEnclosures(
  positions: { x: number; y: number }[],
  edgeBuildings: Map<number, EdgeBuilding>,
  blockedTiles: Set<number>,
  waterTiles: Set<number>,
): Enclosure[] {
  if (positions.length < 2) return [];

  // Track which creature indices have been assigned to a component
  const visited = new Set<number>(); // tile keys
  const creatureAssigned = new Set<number>(); // position indices
  const enclosures: Enclosure[] = [];

  for (let i = 0; i < positions.length; i++) {
    if (creatureAssigned.has(i)) continue;

    const pos = positions[i];
    const startKey = tileKey(pos.x, pos.y);
    if (visited.has(startKey)) {
      // This tile was already flood-filled by another creature's component.
      // Find which enclosure it belongs to and add this creature to it.
      for (const enc of enclosures) {
        if (enc.tiles.has(startKey)) {
          enc.creatureIndices.push(i);
          creatureAssigned.add(i);
          break;
        }
      }
      continue;
    }

    // BFS flood-fill from this creature's tile
    const component = new Set<number>();
    const queue = [startKey];
    const componentVisited = new Set<number>([startKey]);
    let reachedBoundary = false;

    while (queue.length > 0) {
      const current = queue.pop()!;
      component.add(current);

      const cx = current % MAP_COLS;
      const cy = Math.floor(current / MAP_COLS);

      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];

        // Out of bounds = reached map boundary = not enclosed
        if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) {
          reachedBoundary = true;
          continue;
        }

        const nk = tileKey(nx, ny);
        if (componentVisited.has(nk)) continue;

        // Check if the edge between current and neighbor is blocked by any edge building
        // (regardless of open/close state for breeding purposes)
        const ek = edgeKeyBetween(cx, cy, nx, ny);
        if (ek != null) {
          const eb = edgeBuildings.get(ek);
          if (eb && eb.state === "complete") {
            // ALL completed edge buildings block for breeding enclosure purposes
            componentVisited.add(nk);
            continue;
          }
        }

        // Natural blockers stop flood-fill (but don't mean "not enclosed")
        if (blockedTiles.has(nk) || waterTiles.has(nk)) {
          componentVisited.add(nk);
          continue;
        }

        componentVisited.add(nk);
        queue.push(nk);
      }
    }

    // Mark all component tiles as globally visited
    for (const tk of component) {
      visited.add(tk);
    }

    if (reachedBoundary) {
      // Not enclosed — skip
      creatureAssigned.add(i);
      continue;
    }

    // Find all creatures that are in this component
    const creatureIndices: number[] = [i];
    creatureAssigned.add(i);
    for (let j = i + 1; j < positions.length; j++) {
      if (creatureAssigned.has(j)) continue;
      const pj = positions[j];
      if (component.has(tileKey(pj.x, pj.y))) {
        creatureIndices.push(j);
        creatureAssigned.add(j);
      }
    }

    const maxCapacity = Math.floor(component.size / 3);

    // Only return enclosures with 2+ creatures and room to grow
    if (creatureIndices.length >= 2 && creatureIndices.length < maxCapacity) {
      enclosures.push({ tiles: component, creatureIndices, maxCapacity });
    }
  }

  return enclosures;
}
