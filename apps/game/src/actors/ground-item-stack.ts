import * as ex from "excalibur";
import type { Item } from "../types/item.ts";
import { getItemSprite } from "../systems/sprite-loader.ts";

const TILE_SIZE = 32;

/**
 * An actor representing one or more items stacked on a single tile.
 * Renders the top item's 16×16 sprite centered in the 32×32 tile.
 */
export class GroundItemStack extends ex.Actor {
  readonly tileX: number;
  readonly tileY: number;
  private items: Item[] = [];

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
  addItem(item: Item): void {
    this.items.push(item);
    this.updateSprite();
  }

  /** Remove an item by index from this stack. Returns the removed item. */
  removeItem(index: number): Item {
    const [item] = this.items.splice(index, 1);
    this.updateSprite();
    return item;
  }

  /** Get all items in this stack (read-only copy). */
  getItems(): Item[] {
    return [...this.items];
  }

  /** Get items count. */
  getCount(): number {
    return this.items.length;
  }

  /** Returns true if the stack is empty. */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  private updateSprite(): void {
    if (this.items.length === 0) {
      this.graphics.visible = false;
      return;
    }
    this.graphics.visible = true;
    // Show the top (last) item's sprite
    const topItem = this.items[this.items.length - 1];
    const sprite = getItemSprite(topItem.itemSprite ?? "small-rock");
    if (sprite) {
      this.graphics.use(sprite);
    }
  }
}
