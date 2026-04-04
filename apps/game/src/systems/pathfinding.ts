/**
 * A* pathfinding on the 64×64 tile grid.
 *
 * Cardinal movement only (no diagonal). Uses the same BlockedCheck callback
 * as the Player so walls, fences, water, etc. are respected.
 */

const MAP_COLS = 64;
const MAP_ROWS = 64;

function tileKey(x: number, y: number): number {
  return y * MAP_COLS + x;
}

// Cardinal direction offsets
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

type BlockedCheck = (fromX: number, fromY: number, toX: number, toY: number) => boolean;

/**
 * Find a path from (startX, startY) to (goalX, goalY) on the tile grid.
 *
 * @returns Array of tile positions from start (exclusive) to goal (inclusive),
 *          or null if no path exists within maxSteps iterations.
 */
export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  isBlocked: BlockedCheck,
  maxSteps = 200,
): { x: number; y: number }[] | null {
  if (startX === goalX && startY === goalY) return [];

  // Quick reject: goal out of bounds
  if (goalX < 0 || goalX >= MAP_COLS || goalY < 0 || goalY >= MAP_ROWS) return null;

  const startKey = tileKey(startX, startY);
  const goalKey = tileKey(goalX, goalY);

  // g-score: cost from start to this node
  const gScore = new Map<number, number>();
  gScore.set(startKey, 0);

  // f-score: g + heuristic
  const fScore = new Map<number, number>();
  const h = Math.abs(goalX - startX) + Math.abs(goalY - startY);
  fScore.set(startKey, h);

  // Parent map for path reconstruction
  const cameFrom = new Map<number, number>();

  // Open set as a simple sorted array (good enough for 64×64 grid)
  const openSet = [startKey];
  const inOpen = new Set<number>([startKey]);
  const closed = new Set<number>();

  let steps = 0;

  while (openSet.length > 0 && steps < maxSteps) {
    steps++;

    // Find node with lowest fScore in open set
    let bestIdx = 0;
    let bestF = fScore.get(openSet[0]) ?? Infinity;
    for (let i = 1; i < openSet.length; i++) {
      const f = fScore.get(openSet[i]) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const currentKey = openSet[bestIdx];
    openSet.splice(bestIdx, 1);
    inOpen.delete(currentKey);

    if (currentKey === goalKey) {
      // Reconstruct path
      const path: { x: number; y: number }[] = [];
      let key = goalKey;
      while (key !== startKey) {
        const x = key % MAP_COLS;
        const y = Math.floor(key / MAP_COLS);
        path.push({ x, y });
        key = cameFrom.get(key)!;
      }
      path.reverse();
      return path;
    }

    closed.add(currentKey);

    const cx = currentKey % MAP_COLS;
    const cy = Math.floor(currentKey / MAP_COLS);
    const currentG = gScore.get(currentKey) ?? Infinity;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];

      if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) continue;

      const nk = tileKey(nx, ny);
      if (closed.has(nk)) continue;
      if (isBlocked(cx, cy, nx, ny)) continue;

      const tentativeG = currentG + 1;
      const existingG = gScore.get(nk) ?? Infinity;

      if (tentativeG < existingG) {
        cameFrom.set(nk, currentKey);
        gScore.set(nk, tentativeG);
        fScore.set(nk, tentativeG + Math.abs(goalX - nx) + Math.abs(goalY - ny));

        if (!inOpen.has(nk)) {
          openSet.push(nk);
          inOpen.add(nk);
        }
      }
    }
  }

  return null; // No path found
}
