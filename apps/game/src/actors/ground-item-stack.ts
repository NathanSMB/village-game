import * as ex from "excalibur";
import type { Item } from "../types/item.ts";
import { getItemSprite } from "../systems/sprite-loader.ts";

const TILE_SIZE = 32;

export interface GroundItemEntry {
  item: Item;
  /** Milliseconds since this item was placed on the ground. */
  age: number;
  /** Permanent items never despawn (e.g. initial map rocks). */
  permanent: boolean;
}

/**
 * An actor representing one or more items stacked on a single tile.
 * Renders the top item's 16×16 sprite centered in the 32×32 tile.
 */
export class GroundItemStack extends ex.Actor {
  readonly tileX: number;
  readonly tileY: number;
  private entries: GroundItemEntry[] = [];

  constructor(tileX: number, tileY: number) {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    super({
      pos: ex.vec(px, py),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 3,
    });
    this.tileX = tileX;
    this.tileY = tileY;
  }

  /** Add an item to this stack and update the displayed sprite. */
  addItem(item: Item, permanent = false): void {
    this.entries.push({ item, age: 0, permanent });
    this.updateSprite();
  }

  /** Add an item with pre-existing age/permanent state (used when restoring saves). */
  addItemWithState(item: Item, age: number, permanent: boolean): void {
    this.entries.push({ item, age, permanent });
    this.updateSprite();
  }

  /** Remove an item by index from this stack. Returns the removed item. */
  removeItem(index: number): Item {
    const [entry] = this.entries.splice(index, 1);
    this.updateSprite();
    return entry.item;
  }

  /** Get all items in this stack (read-only copy). */
  getItems(): Item[] {
    return this.entries.map((e) => e.item);
  }

  /** Get full entry data (for saving). */
  getEntries(): readonly GroundItemEntry[] {
    return this.entries;
  }

  /** Get items count. */
  getCount(): number {
    return this.entries.length;
  }

  /** Returns true if the stack is empty. */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /**
   * Advance age timers and remove expired (non-permanent) entries.
   * Returns true if any items were removed.
   */
  tickDespawn(delta: number, maxAge: number): boolean {
    let removed = false;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry.permanent) continue;
      entry.age += delta;
      if (entry.age >= maxAge) {
        this.entries.splice(i, 1);
        removed = true;
      }
    }
    if (removed) this.updateSprite();
    return removed;
  }

  private updateSprite(): void {
    if (this.entries.length === 0) {
      this.graphics.visible = false;
      return;
    }
    this.graphics.visible = true;
    // Show the top (last) item's sprite
    const topItem = this.entries[this.entries.length - 1].item;
    const sprite = getItemSprite(topItem.itemSprite ?? "small-rock");
    if (sprite) {
      this.graphics.use(sprite);
    }
  }
}
