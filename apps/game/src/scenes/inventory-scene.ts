import * as ex from "excalibur";
import { wasActionPressed } from "../systems/keybinds.ts";
import {
  type InventoryState,
  totalWeight,
  equipItem,
  unequipItem,
  consumeItem,
} from "../types/inventory.ts";
import {
  ALL_EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  RARITY_COLORS,
  isConsumable,
  type EquipmentSlot,
  type Item,
} from "../types/item.ts";
import type { Player } from "../actors/player.ts";
import type { GameWorld } from "./game-world.ts";
import { RECIPES } from "../data/recipes.ts";
import { canCraft, craft } from "../types/crafting.ts";
import { ITEMS } from "../data/items.ts";

/* ── Font constants ─────────────────────────────────────────────── */

const FONT_DROP_HINT = new ex.Font({
  family: "monospace",
  size: 14,
  color: ex.Color.fromHex("#aaaaaa"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_TITLE = new ex.Font({
  family: "monospace",
  size: 36,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_HEADER = new ex.Font({
  family: "monospace",
  size: 20,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_SLOT_LABEL = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.fromHex("#aaaaaa"),
  textAlign: ex.TextAlign.Right,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_SLOT_VALUE = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_SLOT_SELECTED = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_EMPTY = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.fromHex("#666666"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_BAG_ITEM = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_BAG_SELECTED = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_BAG_EMPTY = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.fromHex("#888888"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_DETAIL_NAME = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_DETAIL = new ex.Font({
  family: "monospace",
  size: 14,
  color: ex.Color.fromHex("#cccccc"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_WEIGHT = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_CRAFT_AVAILABLE = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_CRAFT_UNAVAILABLE = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.fromHex("#666666"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_CRAFT_SELECTED = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_FILTER = new ex.Font({
  family: "monospace",
  size: 14,
  color: ex.Color.fromHex("#555555"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_FILTER_ACTIVE = new ex.Font({
  family: "monospace",
  size: 14,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_FILTER_TYPING = new ex.Font({
  family: "monospace",
  size: 14,
  bold: true,
  color: ex.Color.fromHex("#66cc66"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

/* ── Layout constants ───────────────────────────────────────────── */

const MAX_VISIBLE_BAG = 7;
const MAX_VISIBLE_RECIPES = 8;
const SLOT_COUNT = ALL_EQUIPMENT_SLOTS.length;
const MAX_FILTER_LENGTH = 16;

/* ── Types ──────────────────────────────────────────────────────── */

type Focus = "equipment" | "bag" | "crafting";
type SortMode = "default" | "a-z" | "z-a";

interface BagEntry {
  item: Item;
  realIndex: number;
}

/* ── Scene ──────────────────────────────────────────────────────── */

export class InventoryScene extends ex.Scene {
  private focus: Focus = "equipment";
  private equipmentIndex = 0;
  private bagIndex = 0;
  private bagScrollOffset = 0;
  private craftIndex = 0;
  private craftScrollOffset = 0;
  private inventory: InventoryState | null = null;
  private player: Player | null = null;

  // Filter & sort
  private filterText = "";
  private filterActive = false;
  private sortMode: SortMode = "default";
  private viewBag: BagEntry[] = [];
  private onFilterBar = false;

  // Labels
  private slotLabels: ex.Label[] = [];
  private slotValues: ex.Label[] = [];
  private bagHeaderLabel!: ex.Label;
  private filterLabel!: ex.Label;
  private bagLabels: ex.Label[] = [];
  private bagEmptyLabel!: ex.Label;
  private weightLabel!: ex.Label;
  private craftLabels: ex.Label[] = [];

  // Detail panel
  private detailName!: ex.Label;
  private detailRarity!: ex.Label;
  private detailDesc!: ex.Label;
  private detailStats!: ex.Label;
  private detailWeight!: ex.Label;
  private dropHintLabel!: ex.Label;

  private allActors: ex.Actor[] = [];
  private centerX = 0;

  /* ── Lifecycle ──────────────────────────────────────────────── */

  override onInitialize(engine: ex.Engine): void {
    this.centerX = engine.drawWidth / 2;

    const title = new ex.Label({
      text: "Inventory",
      pos: ex.vec(this.centerX, 30),
      font: FONT_TITLE,
    });
    this.add(title);
    this.allActors.push(title);

    // ── Equipment panel (left side) ──
    const eqHeaderX = this.centerX * 0.35;
    const eqHeader = new ex.Label({
      text: "Equipment",
      pos: ex.vec(eqHeaderX, 65),
      font: FONT_HEADER,
    });
    this.add(eqHeader);
    this.allActors.push(eqHeader);

    const slotLabelX = eqHeaderX - 10;
    const slotValueX = eqHeaderX + 10;
    const slotStartY = 95;
    const slotSpacing = 28;

    for (let i = 0; i < SLOT_COUNT; i++) {
      const y = slotStartY + i * slotSpacing;
      const slot = ALL_EQUIPMENT_SLOTS[i];

      const label = new ex.Label({
        text: `${EQUIPMENT_SLOT_LABELS[slot]}:`,
        pos: ex.vec(slotLabelX, y),
        font: FONT_SLOT_LABEL,
      });
      this.add(label);
      this.allActors.push(label);
      this.slotLabels.push(label);

      const value = new ex.Label({
        text: "",
        pos: ex.vec(slotValueX, y),
        font: FONT_SLOT_VALUE.clone(),
      });
      value.on("pointerdown", () => {
        this.focus = "equipment";
        this.equipmentIndex = i;
        this.updateDisplay();
      });
      this.add(value);
      this.allActors.push(value);
      this.slotValues.push(value);
    }

    // ── Bag panel (center) ──
    const bagHeaderX = this.centerX;
    const bagItemX = bagHeaderX - 60;

    this.bagHeaderLabel = new ex.Label({
      text: "Bag",
      pos: ex.vec(bagHeaderX, 65),
      font: FONT_HEADER,
    });
    this.add(this.bagHeaderLabel);
    this.allActors.push(this.bagHeaderLabel);

    // Filter bar (sits between header and item list)
    this.filterLabel = new ex.Label({
      text: "",
      pos: ex.vec(bagItemX, 90),
      font: FONT_FILTER.clone(),
    });
    this.filterLabel.on("pointerdown", () => {
      this.focus = "bag";
      this.onFilterBar = true;
      this.filterActive = true;
      this.updateDisplay();
    });
    this.add(this.filterLabel);
    this.allActors.push(this.filterLabel);

    this.bagEmptyLabel = new ex.Label({
      text: "Empty",
      pos: ex.vec(bagHeaderX, 185),
      font: FONT_BAG_EMPTY,
    });
    this.add(this.bagEmptyLabel);
    this.allActors.push(this.bagEmptyLabel);

    const bagStartY = 115;
    for (let i = 0; i < MAX_VISIBLE_BAG; i++) {
      const y = bagStartY + i * 28;
      const label = new ex.Label({
        text: "",
        pos: ex.vec(bagItemX, y),
        font: FONT_BAG_ITEM.clone(),
      });
      label.on("pointerdown", () => {
        const viewIdx = this.bagScrollOffset + i;
        if (viewIdx < this.viewBag.length) {
          this.focus = "bag";
          this.onFilterBar = false;
          this.bagIndex = viewIdx;
          this.updateDisplay();
        }
      });
      this.add(label);
      this.allActors.push(label);
      this.bagLabels.push(label);
    }

    // ── Crafting panel (right side) ──
    const craftHeaderX = this.centerX * 1.65;
    const craftHeader = new ex.Label({
      text: "Craft",
      pos: ex.vec(craftHeaderX, 65),
      font: FONT_HEADER,
    });
    this.add(craftHeader);
    this.allActors.push(craftHeader);

    const craftStartY = 95;
    const craftItemX = craftHeaderX - 60;

    for (let i = 0; i < MAX_VISIBLE_RECIPES; i++) {
      const y = craftStartY + i * 28;
      const label = new ex.Label({
        text: "",
        pos: ex.vec(craftItemX, y),
        font: FONT_CRAFT_AVAILABLE.clone(),
      });
      label.on("pointerdown", () => {
        this.focus = "crafting";
        this.craftIndex = this.craftScrollOffset + i;
        this.updateDisplay();
      });
      this.add(label);
      this.allActors.push(label);
      this.craftLabels.push(label);
    }

    // ── Weight display ──
    this.weightLabel = new ex.Label({
      text: "",
      pos: ex.vec(this.centerX, 325),
      font: FONT_WEIGHT,
    });
    this.add(this.weightLabel);
    this.allActors.push(this.weightLabel);

    // ── Detail panel (bottom area) ──
    const detailX = 30;
    const detailY = 350;

    this.detailName = new ex.Label({
      text: "",
      pos: ex.vec(detailX, detailY),
      font: FONT_DETAIL_NAME.clone(),
    });
    this.add(this.detailName);
    this.allActors.push(this.detailName);

    this.detailRarity = new ex.Label({
      text: "",
      pos: ex.vec(detailX, detailY + 20),
      font: FONT_DETAIL.clone(),
    });
    this.add(this.detailRarity);
    this.allActors.push(this.detailRarity);

    this.detailDesc = new ex.Label({
      text: "",
      pos: ex.vec(detailX, detailY + 38),
      font: FONT_DETAIL.clone(),
    });
    this.add(this.detailDesc);
    this.allActors.push(this.detailDesc);

    this.detailStats = new ex.Label({
      text: "",
      pos: ex.vec(detailX, detailY + 56),
      font: FONT_DETAIL.clone(),
    });
    this.add(this.detailStats);
    this.allActors.push(this.detailStats);

    this.detailWeight = new ex.Label({
      text: "",
      pos: ex.vec(detailX, detailY + 74),
      font: FONT_DETAIL.clone(),
    });
    this.add(this.detailWeight);
    this.allActors.push(this.detailWeight);

    this.dropHintLabel = new ex.Label({
      text: "",
      pos: ex.vec(detailX, detailY + 94),
      font: FONT_DROP_HINT.clone(),
    });
    this.add(this.dropHintLabel);
    this.allActors.push(this.dropHintLabel);
  }

  override onActivate(): void {
    const gameWorld = this.engine.scenes["game-world"] as GameWorld;
    this.player = gameWorld.getPlayer();
    this.inventory = gameWorld.getPlayerInventory();
    this.focus = "equipment";
    this.equipmentIndex = 0;
    this.bagIndex = 0;
    this.bagScrollOffset = 0;
    this.craftIndex = 0;
    this.craftScrollOffset = 0;
    this.filterText = "";
    this.filterActive = false;
    this.sortMode = "default";
    this.onFilterBar = false;
    this.rebuildViewBag();
    this.updateDisplay();
  }

  /* ── Frame update ───────────────────────────────────────────── */

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    // Filter typing mode captures all keyboard input
    if (this.filterActive) {
      this.handleFilterInput(kb);
      return;
    }

    if (wasActionPressed(kb, "back") || wasActionPressed(kb, "inventory")) {
      void engine.goToScene("game-world");
      return;
    }

    // Panel navigation: Left / Right to switch focus
    if (wasActionPressed(kb, "moveLeft")) {
      if (this.focus === "bag") {
        this.focus = "equipment";
        this.updateDisplay();
        return;
      }
      if (this.focus === "crafting") {
        this.focus = "bag";
        this.rebuildViewBag();
        this.enterBagPanel();
        this.updateDisplay();
        return;
      }
    }

    if (wasActionPressed(kb, "moveRight")) {
      if (this.focus === "equipment") {
        this.focus = "bag";
        this.rebuildViewBag();
        this.enterBagPanel();
        this.updateDisplay();
        return;
      }
      if (this.focus === "bag") {
        if (RECIPES.length > 0) {
          this.focus = "crafting";
          this.updateDisplay();
        }
        return;
      }
    }

    // Panel-specific input
    if (this.focus === "equipment") {
      this.handleEquipmentInput(kb);
    } else if (this.focus === "bag") {
      this.handleBagInput(kb, engine);
    } else if (this.focus === "crafting") {
      this.handleCraftingInput(kb);
    }
  }

  /* ── Input handlers ─────────────────────────────────────────── */

  private handleEquipmentInput(kb: ex.Keyboard): void {
    if (wasActionPressed(kb, "moveUp")) {
      this.equipmentIndex = (this.equipmentIndex - 1 + SLOT_COUNT) % SLOT_COUNT;
      this.updateDisplay();
    }
    if (wasActionPressed(kb, "moveDown")) {
      this.equipmentIndex = (this.equipmentIndex + 1) % SLOT_COUNT;
      this.updateDisplay();
    }
    if (wasActionPressed(kb, "confirm") && this.inventory) {
      const slot = ALL_EQUIPMENT_SLOTS[this.equipmentIndex];
      if (this.inventory.equipment[slot]) {
        unequipItem(this.inventory, slot);
        this.player?.refreshSprite();
        this.rebuildViewBag();
        this.updateDisplay();
      }
    }
  }

  private handleBagInput(kb: ex.Keyboard, engine: ex.Engine): void {
    if (!this.inventory) return;

    // X cycles sort mode
    if (kb.wasPressed(ex.Keys.KeyX)) {
      this.cycleSortMode();
      return;
    }

    // ── Filter bar ──
    if (this.onFilterBar) {
      if (wasActionPressed(kb, "confirm")) {
        this.filterActive = true;
        this.updateDisplay();
        return;
      }
      if (wasActionPressed(kb, "moveDown") && this.viewBag.length > 0) {
        this.onFilterBar = false;
        this.bagIndex = 0;
        this.bagScrollOffset = 0;
        this.updateDisplay();
      }
      return;
    }

    // ── Item list ──
    const viewLen = this.viewBag.length;
    if (viewLen === 0) {
      if (wasActionPressed(kb, "moveUp")) {
        this.onFilterBar = true;
        this.updateDisplay();
      }
      return;
    }

    if (wasActionPressed(kb, "moveUp")) {
      if (this.bagIndex > 0) {
        this.bagIndex--;
        if (this.bagIndex < this.bagScrollOffset) {
          this.bagScrollOffset = this.bagIndex;
        }
      } else {
        this.onFilterBar = true;
      }
      this.updateDisplay();
    }

    if (wasActionPressed(kb, "moveDown")) {
      if (this.bagIndex < viewLen - 1) {
        this.bagIndex++;
        if (this.bagIndex >= this.bagScrollOffset + MAX_VISIBLE_BAG) {
          this.bagScrollOffset = this.bagIndex - MAX_VISIBLE_BAG + 1;
        }
        this.updateDisplay();
      }
    }

    if (wasActionPressed(kb, "confirm")) {
      const entry = this.viewBag[this.bagIndex];
      if (!entry) return;

      if (isConsumable(entry.item)) {
        if (this.player) {
          const newVitals = consumeItem(this.inventory, entry.realIndex, this.player.vitals);
          if (newVitals) {
            this.player.vitals = newVitals;
          }
        }
      } else {
        equipItem(this.inventory, entry.realIndex);
        this.player?.refreshSprite();
      }

      this.afterBagMutation();
      this.updateDisplay();
    }

    if (wasActionPressed(kb, "drop")) {
      this.dropSelectedItem(engine);
    }
  }

  private handleFilterInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.Escape) || kb.wasPressed(ex.Keys.Enter)) {
      this.filterActive = false;
      if (this.viewBag.length > 0) {
        this.onFilterBar = false;
        this.bagIndex = 0;
        this.bagScrollOffset = 0;
      }
      this.updateDisplay();
      return;
    }

    if (kb.wasPressed(ex.Keys.Backspace)) {
      this.filterText = this.filterText.slice(0, -1);
      this.afterFilterChange();
      return;
    }

    const pressed = kb.getKeys();
    const shift = kb.isHeld(ex.Keys.ShiftLeft) || kb.isHeld(ex.Keys.ShiftRight);
    for (const key of pressed) {
      if (!kb.wasPressed(key)) continue;
      const ch = this.keyToChar(key, shift);
      if (ch && this.filterText.length < MAX_FILTER_LENGTH) {
        this.filterText += ch;
        this.afterFilterChange();
        break;
      }
    }
  }

  private handleCraftingInput(kb: ex.Keyboard): void {
    if (!this.inventory) return;
    const recipeCount = RECIPES.length;
    if (recipeCount === 0) return;

    if (wasActionPressed(kb, "moveUp")) {
      if (this.craftIndex > 0) {
        this.craftIndex--;
        if (this.craftIndex < this.craftScrollOffset) {
          this.craftScrollOffset = this.craftIndex;
        }
        this.updateDisplay();
      }
    }
    if (wasActionPressed(kb, "moveDown")) {
      if (this.craftIndex < recipeCount - 1) {
        this.craftIndex++;
        if (this.craftIndex >= this.craftScrollOffset + MAX_VISIBLE_RECIPES) {
          this.craftScrollOffset = this.craftIndex - MAX_VISIBLE_RECIPES + 1;
        }
        this.updateDisplay();
      }
    }
    if (wasActionPressed(kb, "confirm")) {
      const recipe = RECIPES[this.craftIndex];
      if (recipe && craft(this.inventory, recipe)) {
        this.rebuildViewBag();
        this.updateDisplay();
      }
    }
  }

  /* ── Filter / sort helpers ──────────────────────────────────── */

  private keyToChar(key: ex.Keys, shift: boolean): string | null {
    const str = key as string;
    if (str.startsWith("Key") && str.length === 4) {
      const letter = str[3];
      return shift ? letter : letter.toLowerCase();
    }
    if (str.startsWith("Digit") && str.length === 6) return str[5];
    if (key === ex.Keys.Space) return " ";
    if (key === ex.Keys.Minus) return shift ? "_" : "-";
    return null;
  }

  private cycleSortMode(): void {
    if (this.sortMode === "default") this.sortMode = "a-z";
    else if (this.sortMode === "a-z") this.sortMode = "z-a";
    else this.sortMode = "default";
    this.rebuildViewBag();
    this.clampBagIndex();
    this.updateDisplay();
  }

  private rebuildViewBag(): void {
    if (!this.inventory) {
      this.viewBag = [];
      return;
    }

    let entries: BagEntry[] = this.inventory.bag.map((item, i) => ({
      item,
      realIndex: i,
    }));

    // Filter by name
    const query = this.filterText.trim().toLowerCase();
    if (query) {
      entries = entries.filter((e) => e.item.name.toLowerCase().includes(query));
    }

    // Sort
    if (this.sortMode === "a-z") {
      entries.sort((a, b) => a.item.name.localeCompare(b.item.name));
    } else if (this.sortMode === "z-a") {
      entries.sort((a, b) => b.item.name.localeCompare(a.item.name));
    }

    this.viewBag = entries;
  }

  private afterFilterChange(): void {
    this.rebuildViewBag();
    this.bagIndex = 0;
    this.bagScrollOffset = 0;
    this.updateDisplay();
  }

  private afterBagMutation(): void {
    this.rebuildViewBag();
    if (!this.inventory || this.inventory.bag.length === 0) {
      this.focus = "equipment";
      this.onFilterBar = false;
    } else if (this.viewBag.length === 0) {
      this.onFilterBar = true;
    }
    this.clampBagIndex();
  }

  private clampBagIndex(): void {
    if (this.viewBag.length === 0) {
      this.bagIndex = 0;
      this.bagScrollOffset = 0;
    } else if (this.bagIndex >= this.viewBag.length) {
      this.bagIndex = this.viewBag.length - 1;
    }
    if (this.bagScrollOffset > this.bagIndex) {
      this.bagScrollOffset = this.bagIndex;
    }
    if (this.bagIndex >= this.bagScrollOffset + MAX_VISIBLE_BAG) {
      this.bagScrollOffset = this.bagIndex - MAX_VISIBLE_BAG + 1;
    }
  }

  private enterBagPanel(): void {
    if (this.viewBag.length > 0) {
      this.onFilterBar = false;
      this.bagIndex = Math.min(this.bagIndex, this.viewBag.length - 1);
    } else {
      this.onFilterBar = true;
    }
  }

  /* ── Actions ────────────────────────────────────────────────── */

  private dropSelectedItem(engine: ex.Engine): void {
    if (!this.inventory || !this.player || this.onFilterBar) return;

    const entry = this.viewBag[this.bagIndex];
    if (!entry) return;

    this.inventory.bag.splice(entry.realIndex, 1);

    const gameWorld = engine.scenes["game-world"] as GameWorld;
    const playerTileX = this.player.getTileX();
    const playerTileY = this.player.getTileY();
    gameWorld.dropItemAt(playerTileX, playerTileY, entry.item);

    this.afterBagMutation();
    this.updateDisplay();
  }

  private getSelectedItem(): Item | null {
    if (!this.inventory) return null;
    if (this.focus === "equipment") {
      const slot = ALL_EQUIPMENT_SLOTS[this.equipmentIndex];
      return this.inventory.equipment[slot];
    }
    if (this.focus === "bag" && !this.onFilterBar) {
      return this.viewBag[this.bagIndex]?.item ?? null;
    }
    return null;
  }

  /* ── Display ────────────────────────────────────────────────── */

  private updateDisplay(): void {
    if (!this.inventory) return;

    // ── Equipment slots ──
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = ALL_EQUIPMENT_SLOTS[i] as EquipmentSlot;
      const item = this.inventory.equipment[slot];
      const selected = this.focus === "equipment" && i === this.equipmentIndex;
      const value = this.slotValues[i];

      if (item) {
        value.text = selected ? `> ${item.name}` : item.name;
        value.font = selected ? FONT_SLOT_SELECTED.clone() : FONT_SLOT_VALUE.clone();
        value.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      } else {
        value.text = selected ? "> (Empty)" : "(Empty)";
        value.font = selected ? FONT_SLOT_SELECTED.clone() : FONT_EMPTY.clone();
        value.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.fromHex("#666666");
      }
    }

    // ── Bag header (count + sort mode) ──
    const totalItems = this.inventory.bag.length;
    const filteredCount = this.viewBag.length;
    const hasFilter = this.filterText.trim().length > 0;

    let header = "Bag";
    if (hasFilter) {
      header += ` (${filteredCount}/${totalItems})`;
    } else if (totalItems > 0) {
      header += ` (${totalItems})`;
    }
    if (this.sortMode === "a-z") header += " A-Z";
    else if (this.sortMode === "z-a") header += " Z-A";
    this.bagHeaderLabel.text = header;

    // ── Filter bar ──
    if (this.filterActive) {
      this.filterLabel.text = `/ ${this.filterText}_`;
      this.filterLabel.font = FONT_FILTER_TYPING.clone();
      this.filterLabel.color = ex.Color.fromHex("#66cc66");
    } else if (this.focus === "bag" && this.onFilterBar) {
      this.filterLabel.text = this.filterText ? `> / ${this.filterText}` : "> / ...";
      this.filterLabel.font = FONT_FILTER_ACTIVE.clone();
      this.filterLabel.color = ex.Color.fromHex("#f0c040");
    } else if (this.filterText) {
      this.filterLabel.text = `/ ${this.filterText}`;
      this.filterLabel.font = FONT_FILTER.clone();
      this.filterLabel.color = ex.Color.fromHex("#888888");
    } else {
      this.filterLabel.text = "/ ...";
      this.filterLabel.font = FONT_FILTER.clone();
      this.filterLabel.color = ex.Color.fromHex("#555555");
    }

    // ── Bag items ──
    if (totalItems === 0) {
      this.bagEmptyLabel.text = "Empty";
      this.bagEmptyLabel.color = ex.Color.fromHex("#888888");
    } else if (filteredCount === 0) {
      this.bagEmptyLabel.text = "No matches";
      this.bagEmptyLabel.color = ex.Color.fromHex("#666666");
    } else {
      this.bagEmptyLabel.text = "";
    }

    for (let i = 0; i < MAX_VISIBLE_BAG; i++) {
      const viewIdx = this.bagScrollOffset + i;
      const label = this.bagLabels[i];
      if (viewIdx < this.viewBag.length) {
        const entry = this.viewBag[viewIdx];
        const selected = this.focus === "bag" && !this.onFilterBar && viewIdx === this.bagIndex;
        label.text = selected ? `> ${entry.item.name}` : entry.item.name;
        label.font = selected ? FONT_BAG_SELECTED.clone() : FONT_BAG_ITEM.clone();
        label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      } else {
        label.text = "";
      }
    }

    // ── Crafting recipes ──
    for (let i = 0; i < MAX_VISIBLE_RECIPES; i++) {
      const recipeIdx = this.craftScrollOffset + i;
      const label = this.craftLabels[i];
      if (recipeIdx < RECIPES.length) {
        const recipe = RECIPES[recipeIdx];
        const available = canCraft(this.inventory, recipe);
        const selected = this.focus === "crafting" && recipeIdx === this.craftIndex;

        label.text = selected ? `> ${recipe.name}` : recipe.name;
        if (selected) {
          label.font = FONT_CRAFT_SELECTED.clone();
          label.color = ex.Color.fromHex("#f0c040");
        } else if (available) {
          label.font = FONT_CRAFT_AVAILABLE.clone();
          label.color = ex.Color.White;
        } else {
          label.font = FONT_CRAFT_UNAVAILABLE.clone();
          label.color = ex.Color.fromHex("#666666");
        }
      } else {
        label.text = "";
      }
    }

    // ── Weight ──
    const current = totalWeight(this.inventory);
    this.weightLabel.text = `Weight: ${current} / ${this.inventory.maxWeight}`;
    this.weightLabel.color =
      current > this.inventory.maxWeight ? ex.Color.fromHex("#ff6060") : ex.Color.White;

    // ── Detail panel ──
    if (this.focus === "crafting") {
      this.updateCraftingDetail();
    } else {
      this.updateItemDetail();
    }
  }

  private updateItemDetail(): void {
    const item = this.getSelectedItem();
    if (item) {
      this.detailName.text = item.name;
      this.detailName.color = ex.Color.fromHex(RARITY_COLORS[item.rarity]);

      if (isConsumable(item)) {
        this.detailRarity.text = `${item.rarity} - Consumable`;
      } else if (item.slot) {
        this.detailRarity.text = `${item.rarity} - ${EQUIPMENT_SLOT_LABELS[item.slot]}`;
      } else {
        this.detailRarity.text = item.rarity;
      }
      this.detailRarity.color = ex.Color.fromHex(RARITY_COLORS[item.rarity]);

      this.detailDesc.text = item.description;
      this.detailDesc.color = ex.Color.fromHex("#cccccc");

      if (isConsumable(item)) {
        const effectParts: string[] = [];
        if (item.consumable?.hungerRestore)
          effectParts.push(`Hunger +${item.consumable.hungerRestore}`);
        if (item.consumable?.thirstRestore)
          effectParts.push(`Thirst +${item.consumable.thirstRestore}`);
        if (item.consumable?.healthRestore)
          effectParts.push(`Health +${item.consumable.healthRestore}`);
        this.detailStats.text = effectParts.length > 0 ? effectParts.join("  ") : "No effects";
        this.detailStats.color =
          effectParts.length > 0 ? ex.Color.fromHex("#66cc66") : ex.Color.fromHex("#888888");
      } else {
        // Use canonical ITEMS definition so old saves still show correct stats
        const canonical = ITEMS[item.id] ?? item;
        const statParts: string[] = [];
        if (canonical.stats.attack) statParts.push(`ATK +${canonical.stats.attack}`);
        if (canonical.stats.defense) statParts.push(`DEF +${canonical.stats.defense}`);
        if (canonical.stats.speed) statParts.push(`SPD +${canonical.stats.speed}`);
        // Show tool multiplier bonuses
        if (canonical.toolMultipliers) {
          const labels: Record<string, string> = { tree: "Trees", mineable: "Rocks" };
          for (const [category, mult] of Object.entries(canonical.toolMultipliers)) {
            if (mult && mult > 1) {
              statParts.push(`${mult}x vs ${labels[category] ?? category}`);
            }
          }
        }
        this.detailStats.text = statParts.length > 0 ? statParts.join("  ") : "No bonuses";
        this.detailStats.color =
          statParts.length > 0 ? ex.Color.fromHex("#66cc66") : ex.Color.fromHex("#888888");
      }

      this.detailWeight.text = `Weight: ${item.weight}`;
      this.detailWeight.color = ex.Color.fromHex("#cccccc");
    } else {
      this.detailName.text = "";
      this.detailRarity.text = "";
      this.detailDesc.text = this.focus === "equipment" ? "Slot is empty" : "";
      this.detailStats.text = "";
      this.detailWeight.text = "";
    }

    // ── Context hints ──
    if (this.focus === "bag") {
      if (this.filterActive) {
        this.dropHintLabel.text = "Type to search \u00b7 [Esc] Done";
        this.dropHintLabel.color = ex.Color.fromHex("#66cc66");
      } else if (this.onFilterBar) {
        this.dropHintLabel.text = "[Enter] Search  [X] Sort";
        this.dropHintLabel.color = ex.Color.fromHex("#aaaaaa");
      } else if (item) {
        this.dropHintLabel.text = "[Q] Drop  [X] Sort";
        this.dropHintLabel.color = ex.Color.fromHex("#aaaaaa");
      } else {
        this.dropHintLabel.text = "";
      }
    } else {
      this.dropHintLabel.text = "";
    }
  }

  private updateCraftingDetail(): void {
    const recipe = RECIPES[this.craftIndex];
    if (!recipe || !this.inventory) {
      this.detailName.text = "";
      this.detailRarity.text = "";
      this.detailDesc.text = "";
      this.detailStats.text = "";
      this.detailWeight.text = "";
      this.dropHintLabel.text = "";
      return;
    }

    const resultItem = ITEMS[recipe.resultId];
    if (!resultItem) {
      this.detailName.text = recipe.name;
      this.detailName.color = ex.Color.White;
      this.detailRarity.text = "";
      this.detailDesc.text = "";
      this.detailStats.text = "";
      this.detailWeight.text = "";
      this.dropHintLabel.text = "";
      return;
    }

    // Recipe name in result rarity color
    this.detailName.text = resultItem.name;
    this.detailName.color = ex.Color.fromHex(RARITY_COLORS[resultItem.rarity]);

    // Show rarity and slot
    if (resultItem.slot) {
      this.detailRarity.text = `${resultItem.rarity} - ${EQUIPMENT_SLOT_LABELS[resultItem.slot]}`;
    } else {
      this.detailRarity.text = resultItem.rarity;
    }
    this.detailRarity.color = ex.Color.fromHex(RARITY_COLORS[resultItem.rarity]);

    // Ingredients list with availability coloring
    const ingredientParts: string[] = [];
    for (const ingredient of recipe.ingredients) {
      const ingredientItem = ITEMS[ingredient.itemId];
      const name = ingredientItem ? ingredientItem.name : ingredient.itemId;
      ingredientParts.push(`${ingredient.count}x ${name}`);
    }
    this.detailDesc.text = `Requires: ${ingredientParts.join(", ")}`;
    this.detailDesc.color = canCraft(this.inventory, recipe)
      ? ex.Color.fromHex("#66cc66")
      : ex.Color.fromHex("#cc6666");

    // Result stats
    const statParts: string[] = [];
    if (resultItem.stats.attack) statParts.push(`ATK +${resultItem.stats.attack}`);
    if (resultItem.stats.defense) statParts.push(`DEF +${resultItem.stats.defense}`);
    if (resultItem.stats.speed) statParts.push(`SPD +${resultItem.stats.speed}`);
    this.detailStats.text = statParts.length > 0 ? statParts.join("  ") : "";
    this.detailStats.color = ex.Color.fromHex("#66cc66");

    // Result weight
    this.detailWeight.text = `Weight: ${resultItem.weight}`;
    this.detailWeight.color = ex.Color.fromHex("#cccccc");

    // Craft hint
    if (canCraft(this.inventory, recipe)) {
      this.dropHintLabel.text = "[Enter] Craft";
      this.dropHintLabel.color = ex.Color.fromHex("#aaaaaa");
    } else {
      this.dropHintLabel.text = "Missing materials";
      this.dropHintLabel.color = ex.Color.fromHex("#666666");
    }
  }
}
