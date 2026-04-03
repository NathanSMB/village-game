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

const MAX_VISIBLE_BAG = 8;
const SLOT_COUNT = ALL_EQUIPMENT_SLOTS.length;

type Focus = "equipment" | "bag";

export class InventoryScene extends ex.Scene {
  private focus: Focus = "equipment";
  private equipmentIndex = 0;
  private bagIndex = 0;
  private bagScrollOffset = 0;
  private inventory: InventoryState | null = null;
  private player: Player | null = null;

  private slotLabels: ex.Label[] = [];
  private slotValues: ex.Label[] = [];
  private bagLabels: ex.Label[] = [];
  private bagEmptyLabel!: ex.Label;
  private weightLabel!: ex.Label;

  // Detail panel
  private detailName!: ex.Label;
  private detailRarity!: ex.Label;
  private detailDesc!: ex.Label;
  private detailStats!: ex.Label;
  private detailWeight!: ex.Label;
  private dropHintLabel!: ex.Label;

  private allActors: ex.Actor[] = [];
  private centerX = 0;

  override onInitialize(engine: ex.Engine): void {
    this.centerX = engine.drawWidth / 2;

    const title = new ex.Label({
      text: "Inventory",
      pos: ex.vec(this.centerX, 30),
      font: FONT_TITLE,
    });
    this.add(title);
    this.allActors.push(title);

    // Equipment panel (left side)
    const eqHeaderX = this.centerX * 0.45;
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

    // Bag panel (right side)
    const bagHeaderX = this.centerX * 1.5;
    const bagHeader = new ex.Label({
      text: "Bag",
      pos: ex.vec(bagHeaderX, 65),
      font: FONT_HEADER,
    });
    this.add(bagHeader);
    this.allActors.push(bagHeader);

    const bagStartY = 95;
    const bagItemX = bagHeaderX - 80;

    this.bagEmptyLabel = new ex.Label({
      text: "Empty",
      pos: ex.vec(bagHeaderX, 160),
      font: FONT_BAG_EMPTY,
    });
    this.add(this.bagEmptyLabel);
    this.allActors.push(this.bagEmptyLabel);

    for (let i = 0; i < MAX_VISIBLE_BAG; i++) {
      const y = bagStartY + i * 28;
      const label = new ex.Label({
        text: "",
        pos: ex.vec(bagItemX, y),
        font: FONT_BAG_ITEM.clone(),
      });
      label.on("pointerdown", () => {
        this.focus = "bag";
        this.bagIndex = this.bagScrollOffset + i;
        this.updateDisplay();
      });
      this.add(label);
      this.allActors.push(label);
      this.bagLabels.push(label);
    }

    // Weight display
    this.weightLabel = new ex.Label({
      text: "",
      pos: ex.vec(this.centerX, 310),
      font: FONT_WEIGHT,
    });
    this.add(this.weightLabel);
    this.allActors.push(this.weightLabel);

    // Detail panel (bottom area)
    const detailX = 30;
    const detailY = 340;

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
    this.updateDisplay();
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    if (wasActionPressed(kb, "back") || wasActionPressed(kb, "inventory")) {
      void engine.goToScene("game-world");
      return;
    }

    if (wasActionPressed(kb, "moveLeft") && this.focus === "bag") {
      this.focus = "equipment";
      this.updateDisplay();
      return;
    }

    if (wasActionPressed(kb, "moveRight") && this.focus === "equipment") {
      if (this.inventory && this.inventory.bag.length > 0) {
        this.focus = "bag";
        this.updateDisplay();
      }
      return;
    }

    if (this.focus === "equipment") {
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
          this.updateDisplay();
        }
      }
    } else {
      if (!this.inventory) return;
      const bagLen = this.inventory.bag.length;
      if (bagLen === 0) return;

      if (wasActionPressed(kb, "moveUp")) {
        if (this.bagIndex > 0) {
          this.bagIndex--;
          if (this.bagIndex < this.bagScrollOffset) {
            this.bagScrollOffset = this.bagIndex;
          }
          this.updateDisplay();
        }
      }
      if (wasActionPressed(kb, "moveDown")) {
        if (this.bagIndex < bagLen - 1) {
          this.bagIndex++;
          if (this.bagIndex >= this.bagScrollOffset + MAX_VISIBLE_BAG) {
            this.bagScrollOffset = this.bagIndex - MAX_VISIBLE_BAG + 1;
          }
          this.updateDisplay();
        }
      }
      if (wasActionPressed(kb, "confirm")) {
        const selectedItem = this.inventory.bag[this.bagIndex];
        if (selectedItem && isConsumable(selectedItem)) {
          // Consume the item (eat it)
          if (this.player) {
            const newVitals = consumeItem(this.inventory, this.bagIndex, this.player.vitals);
            if (newVitals) {
              this.player.vitals = newVitals;
            }
          }
        } else {
          // Equip the item
          equipItem(this.inventory, this.bagIndex);
          this.player?.refreshSprite();
        }
        if (this.bagIndex >= this.inventory.bag.length) {
          this.bagIndex = Math.max(0, this.inventory.bag.length - 1);
        }
        if (this.inventory.bag.length === 0) {
          this.focus = "equipment";
        }
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "drop")) {
        this.dropSelectedItem(engine);
      }
    }
  }

  private dropSelectedItem(engine: ex.Engine): void {
    if (!this.inventory || !this.player) return;
    const item = this.inventory.bag[this.bagIndex];
    if (!item) return;

    // Remove from bag
    this.inventory.bag.splice(this.bagIndex, 1);

    // Drop onto the player's current tile
    const gameWorld = engine.scenes["game-world"] as GameWorld;
    const playerTileX = this.player.getTileX();
    const playerTileY = this.player.getTileY();
    gameWorld.dropItemAt(playerTileX, playerTileY, item);

    // Adjust selection
    if (this.bagIndex >= this.inventory.bag.length) {
      this.bagIndex = Math.max(0, this.inventory.bag.length - 1);
    }
    if (this.inventory.bag.length === 0) {
      this.focus = "equipment";
    }
    this.updateDisplay();
  }

  private getSelectedItem(): Item | null {
    if (!this.inventory) return null;
    if (this.focus === "equipment") {
      const slot = ALL_EQUIPMENT_SLOTS[this.equipmentIndex];
      return this.inventory.equipment[slot];
    }
    return this.inventory.bag[this.bagIndex] ?? null;
  }

  private updateDisplay(): void {
    if (!this.inventory) return;

    // Equipment slots
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

    // Bag items
    const bag = this.inventory.bag;
    this.bagEmptyLabel.text = bag.length === 0 ? "Empty" : "";

    for (let i = 0; i < MAX_VISIBLE_BAG; i++) {
      const bagIdx = this.bagScrollOffset + i;
      const label = this.bagLabels[i];
      if (bagIdx < bag.length) {
        const item = bag[bagIdx];
        const selected = this.focus === "bag" && bagIdx === this.bagIndex;
        label.text = selected ? `> ${item.name}` : item.name;
        label.font = selected ? FONT_BAG_SELECTED.clone() : FONT_BAG_ITEM.clone();
        label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      } else {
        label.text = "";
      }
    }

    // Weight
    const current = totalWeight(this.inventory);
    this.weightLabel.text = `Weight: ${current} / ${this.inventory.maxWeight}`;
    this.weightLabel.color =
      current > this.inventory.maxWeight ? ex.Color.fromHex("#ff6060") : ex.Color.White;

    // Detail panel
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
        const statParts: string[] = [];
        if (item.stats.attack) statParts.push(`ATK +${item.stats.attack}`);
        if (item.stats.defense) statParts.push(`DEF +${item.stats.defense}`);
        if (item.stats.speed) statParts.push(`SPD +${item.stats.speed}`);
        this.detailStats.text = statParts.length > 0 ? statParts.join("  ") : "No bonuses";
        this.detailStats.color =
          statParts.length > 0 ? ex.Color.fromHex("#66cc66") : ex.Color.fromHex("#888888");
      }

      this.detailWeight.text = `Weight: ${item.weight}`;
    } else {
      this.detailName.text = "";
      this.detailRarity.text = "";
      this.detailDesc.text = this.focus === "equipment" ? "Slot is empty" : "";
      this.detailStats.text = "";
      this.detailWeight.text = "";
    }

    // Drop hint (only when focus is on bag and an item is selected)
    if (this.focus === "bag" && item) {
      this.dropHintLabel.text = "[Q] Drop";
      this.dropHintLabel.color = ex.Color.fromHex("#aaaaaa");
    } else {
      this.dropHintLabel.text = "";
    }
  }
}
