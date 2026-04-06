import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import { defaultAppearance } from "../types/character.ts";
import {
  CLOTHING_COLORS,
  FACIAL_HAIR_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  SEX_OPTIONS,
  SKIN_TONES,
} from "../data/character-options.ts";
import { actionKeyLabel, wasActionPressed } from "../systems/keybinds.ts";
import { getCharacterPreviewSprite } from "../systems/character-compositor.ts";
import { UI_REF_HEIGHT } from "../systems/ui-scale.ts";

const PREVIEW_SCALE = 6;

const FONT_TITLE = new ex.Font({
  family: "monospace",
  size: 36,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_LABEL = new ex.Font({
  family: "monospace",
  size: 18,
  color: ex.Color.fromHex("#aaaaaa"),
  textAlign: ex.TextAlign.Right,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_VALUE = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_VALUE_LEFT = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_VALUE_SELECTED = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_VALUE_SELECTED_LEFT = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_ARROW = new ex.Font({
  family: "monospace",
  size: 18,
  color: ex.Color.fromHex("#666666"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_ARROW_SELECTED = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_BUTTON = new ex.Font({
  family: "monospace",
  size: 22,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_BUTTON_SELECTED = new ex.Font({
  family: "monospace",
  size: 22,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

interface OptionRowConfig {
  label: string;
  getNames: () => string[];
  getValue: (a: CharacterAppearance) => number;
  setValue: (a: CharacterAppearance, v: number) => void;
}

interface OptionRowUI {
  categoryLabel: ex.Label;
  leftArrow: ex.Label;
  valueLabel: ex.Label;
  rightArrow: ex.Label;
}

function getOptionRows(appearance: CharacterAppearance): OptionRowConfig[] {
  const rows: OptionRowConfig[] = [
    {
      label: "Sex:",
      getNames: () => SEX_OPTIONS.map((o) => o.name),
      getValue: (a) => (a.sex === "male" ? 0 : 1),
      setValue: (a, v) => {
        a.sex = v === 0 ? "male" : "female";
      },
    },
    {
      label: "Skin Tone:",
      getNames: () => SKIN_TONES.map((o) => o.name),
      getValue: (a) => a.skinTone,
      setValue: (a, v) => {
        a.skinTone = v;
      },
    },
    {
      label: "Hair Style:",
      getNames: () => HAIR_STYLES.map((o) => o.name),
      getValue: (a) => a.hairStyle,
      setValue: (a, v) => {
        a.hairStyle = v;
      },
    },
    {
      label: "Hair Color:",
      getNames: () => HAIR_COLORS.map((o) => o.name),
      getValue: (a) => a.hairColor,
      setValue: (a, v) => {
        a.hairColor = v;
      },
    },
  ];

  if (appearance.sex === "male") {
    rows.push({
      label: "Facial Hair:",
      getNames: () => FACIAL_HAIR_STYLES.map((o) => o.name),
      getValue: (a) => a.facialHair,
      setValue: (a, v) => {
        a.facialHair = v;
      },
    });
  }

  rows.push(
    {
      label: "Tunic Color:",
      getNames: () => CLOTHING_COLORS.map((o) => o.name),
      getValue: (a) => a.equipmentColors.torso,
      setValue: (a, v) => {
        a.equipmentColors.torso = v;
      },
    },
    {
      label: "Pants Color:",
      getNames: () => CLOTHING_COLORS.map((o) => o.name),
      getValue: (a) => a.equipmentColors.legs,
      setValue: (a, v) => {
        a.equipmentColors.legs = v;
      },
    },
    {
      label: "Boots Color:",
      getNames: () => CLOTHING_COLORS.map((o) => o.name),
      getValue: (a) => a.equipmentColors.feet,
      setValue: (a, v) => {
        a.equipmentColors.feet = v;
      },
    },
  );

  return rows;
}

const BUTTON_LABELS = ["Randomize", "Confirm", "Back"];

export class CharacterCreator extends ex.Scene {
  private appearance: CharacterAppearance = defaultAppearance();
  private playerName = "";
  private selectedRow = 0; // row 0 = name, rows 1..N = options, rest = buttons
  private previewActor!: ex.Actor;
  private optionRows: OptionRowConfig[] = [];
  private optionRowUIs: OptionRowUI[] = [];
  private buttonLabels: ex.Label[] = [];
  private optionsX = 0;
  private centerX = 0;

  // Name input
  private nameLabel!: ex.Label;
  private nameValueLabel!: ex.Label;
  private nameFocused = false;
  private nameKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  private get totalRows(): number {
    return 1 + this.optionRows.length + BUTTON_LABELS.length; // +1 for name row
  }

  override onInitialize(engine: ex.Engine): void {
    this.centerX = engine.drawWidth / 2;
    this.optionsX = this.centerX * 1.05;

    // Title
    const title = new ex.Label({
      text: "Create Your Character",
      pos: ex.vec(this.centerX, 40),
      font: FONT_TITLE,
    });
    this.add(title);

    // Character preview — position in the left quarter of the zoomed visible area
    const visibleW = (engine.drawWidth * UI_REF_HEIGHT) / engine.drawHeight;
    this.previewActor = new ex.Actor({
      pos: ex.vec(this.centerX - visibleW * 0.25, 230),
      anchor: ex.vec(0.5, 0.5),
    });
    this.previewActor.graphics.use(getCharacterPreviewSprite(this.appearance, PREVIEW_SCALE));
    this.add(this.previewActor);

    this.buildNameRow();
    this.buildOptionRows();
    this.buildButtons();
    this.updateSelection();
  }

  private buildNameRow(): void {
    const y = 80;

    this.nameLabel = new ex.Label({
      text: "Name:",
      pos: ex.vec(this.optionsX - 10, y),
      font: FONT_LABEL,
    });
    this.add(this.nameLabel);

    this.nameValueLabel = new ex.Label({
      text: "(click to type)",
      pos: ex.vec(this.optionsX + 10, y),
      font: FONT_VALUE_LEFT.clone(),
    });
    this.nameValueLabel.on("pointerdown", () => {
      this.selectedRow = 0;
      this.startNameInput();
    });
    this.add(this.nameValueLabel);
  }

  private refreshNameDisplay(): void {
    if (this.nameFocused) {
      this.nameValueLabel.text = (this.playerName || "") + "_";
      this.nameValueLabel.font = FONT_VALUE_SELECTED_LEFT.clone();
      this.nameValueLabel.color = ex.Color.fromHex("#ff8844");
    } else if (this.playerName) {
      this.nameValueLabel.text = this.playerName;
    } else {
      this.nameValueLabel.text = `(press ${actionKeyLabel("confirm")} to type)`;
    }
  }

  private startNameInput(): void {
    this.nameFocused = true;
    this.refreshNameDisplay();
    this.removeNameListener();
    this.nameKeydownHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return; // allow paste
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        this.stopNameInput();
        return;
      }
      if (e.key === "Enter") {
        this.stopNameInput();
        return;
      }
      if (e.key === "Backspace") {
        this.playerName = this.playerName.slice(0, -1);
        this.refreshNameDisplay();
        return;
      }
      if (e.key.length === 1 && this.playerName.length < 16) {
        this.playerName += e.key;
        this.refreshNameDisplay();
      }
    };
    document.addEventListener("keydown", this.nameKeydownHandler, true);

    // Also handle paste
    this.namePasteHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text")?.trim();
      if (text) {
        this.playerName = (this.playerName + text).slice(0, 16);
        this.refreshNameDisplay();
      }
    };
    document.addEventListener("paste", this.namePasteHandler);
  }

  private namePasteHandler: ((e: ClipboardEvent) => void) | null = null;

  private stopNameInput(): void {
    this.nameFocused = false;
    this.removeNameListener();
    this.refreshNameDisplay();
    this.updateSelection();
  }

  private removeNameListener(): void {
    if (this.nameKeydownHandler) {
      document.removeEventListener("keydown", this.nameKeydownHandler, true);
      this.nameKeydownHandler = null;
    }
    if (this.namePasteHandler) {
      document.removeEventListener("paste", this.namePasteHandler);
      this.namePasteHandler = null;
    }
  }

  override onActivate(): void {
    const vh = this.engine.drawHeight * this.camera.zoom;
    this.camera.zoom = vh / UI_REF_HEIGHT;
    this.camera.pos = ex.vec(this.centerX, UI_REF_HEIGHT / 2);
    this.appearance = defaultAppearance();
    this.playerName = "";
    this.selectedRow = 0;
    this.nameFocused = false;
    this.removeNameListener();
    this.refreshNameDisplay();
    this.rebuildOptionRows();
    this.updatePreview();
    this.updateSelection();
  }

  override onDeactivate(): void {
    // Clean up capture-phase DOM listeners so they don't steal keyboard
    // events from Excalibur when another scene is active.
    this.nameFocused = false;
    this.removeNameListener();
  }

  override onPreUpdate(engine: ex.Engine): void {
    // Name typing captures all input via native keydown listener
    if (this.nameFocused) return;

    const kb = engine.input.keyboard;

    if (wasActionPressed(kb, "moveUp")) {
      this.selectedRow = (this.selectedRow - 1 + this.totalRows) % this.totalRows;
      this.updateSelection();
    }

    if (wasActionPressed(kb, "moveDown")) {
      this.selectedRow = (this.selectedRow + 1) % this.totalRows;
      this.updateSelection();
    }

    const isOptionRow = this.selectedRow >= 1 && this.selectedRow <= this.optionRows.length;

    if (wasActionPressed(kb, "moveLeft")) {
      if (isOptionRow) {
        this.cycleOption(-1);
      }
    }

    if (wasActionPressed(kb, "moveRight")) {
      if (isOptionRow) {
        this.cycleOption(1);
      }
    }

    if (wasActionPressed(kb, "confirm")) {
      if (this.selectedRow === 0) {
        this.startNameInput();
      } else if (this.selectedRow > this.optionRows.length) {
        this.activateButton(engine);
      }
    }

    if (wasActionPressed(kb, "back")) {
      void engine.goToScene("start");
    }
  }

  private buildOptionRows(): void {
    this.optionRows = getOptionRows(this.appearance);
    const rowStartY = 115; // offset for name row above
    const rowSpacing = 34;

    for (let i = 0; i < this.optionRows.length; i++) {
      const config = this.optionRows[i];
      const y = rowStartY + i * rowSpacing;

      const categoryLabel = new ex.Label({
        text: config.label,
        pos: ex.vec(this.optionsX - 10, y),
        font: FONT_LABEL,
      });
      this.add(categoryLabel);

      const leftArrow = new ex.Label({
        text: "<",
        pos: ex.vec(this.optionsX + 10, y),
        font: FONT_ARROW.clone(),
      });
      leftArrow.on("pointerdown", () => {
        this.selectedRow = i + 1; // +1 for name row
        this.cycleOption(-1);
      });
      this.add(leftArrow);

      const valueLabel = new ex.Label({
        text: this.getOptionName(i),
        pos: ex.vec(this.optionsX + 75, y),
        font: FONT_VALUE.clone(),
      });
      this.add(valueLabel);

      const rightArrow = new ex.Label({
        text: ">",
        pos: ex.vec(this.optionsX + 140, y),
        font: FONT_ARROW.clone(),
      });
      rightArrow.on("pointerdown", () => {
        this.selectedRow = i + 1; // +1 for name row
        this.cycleOption(1);
      });
      this.add(rightArrow);

      this.optionRowUIs.push({ categoryLabel, leftArrow, valueLabel, rightArrow });
    }
  }

  private clearOptionRows(): void {
    for (const row of this.optionRowUIs) {
      this.remove(row.categoryLabel);
      this.remove(row.leftArrow);
      this.remove(row.valueLabel);
      this.remove(row.rightArrow);
    }
    this.optionRowUIs = [];
    this.optionRows = [];
  }

  private rebuildOptionRows(): void {
    this.clearOptionRows();
    this.buildOptionRows();
    this.repositionButtons();
    this.refreshAllOptions();
    this.updateSelection();
  }

  private buildButtons(): void {
    const buttonY = this.getButtonStartY();
    const buttonSpacing = 40;

    for (let i = 0; i < BUTTON_LABELS.length; i++) {
      const label = new ex.Label({
        text: BUTTON_LABELS[i],
        pos: ex.vec(this.centerX, buttonY + i * buttonSpacing),
        font: FONT_BUTTON.clone(),
      });

      label.on("pointerdown", () => {
        this.selectedRow = 1 + this.optionRows.length + i;
        this.activateButton(this.engine);
      });

      label.on("pointerenter", () => {
        this.selectedRow = 1 + this.optionRows.length + i;
        this.updateSelection();
      });

      this.buttonLabels.push(label);
      this.add(label);
    }
  }

  private getButtonStartY(): number {
    return 115 + this.optionRows.length * 34 + 40;
  }

  private repositionButtons(): void {
    const buttonY = this.getButtonStartY();
    const buttonSpacing = 40;
    for (let i = 0; i < this.buttonLabels.length; i++) {
      this.buttonLabels[i].pos = ex.vec(this.centerX, buttonY + i * buttonSpacing);
    }
  }

  private cycleOption(direction: number): void {
    const optIdx = this.selectedRow - 1; // offset for name row
    if (optIdx < 0 || optIdx >= this.optionRows.length) return;
    const config = this.optionRows[optIdx];
    const names = config.getNames();
    const current = config.getValue(this.appearance);
    const next = (current + direction + names.length) % names.length;

    config.setValue(this.appearance, next);
    this.optionRowUIs[optIdx].valueLabel.text = this.getOptionName(optIdx);
    this.updatePreview();

    // If sex changed, rebuild the rows (facial hair appears/disappears)
    if (config.label === "Sex:") {
      const prevRow = this.selectedRow;
      this.rebuildOptionRows();
      this.selectedRow = prevRow;
      this.updateSelection();
    } else {
      this.updateSelection();
    }
  }

  private getOptionName(rowIndex: number): string {
    const config = this.optionRows[rowIndex];
    return config.getNames()[config.getValue(this.appearance)];
  }

  private refreshAllOptions(): void {
    for (let i = 0; i < this.optionRowUIs.length; i++) {
      this.optionRowUIs[i].valueLabel.text = this.getOptionName(i);
    }
  }

  private updatePreview(): void {
    this.previewActor.graphics.use(getCharacterPreviewSprite(this.appearance, PREVIEW_SCALE));
  }

  private updateSelection(): void {
    // Name row (index 0)
    const nameSelected = this.selectedRow === 0;
    if (!this.nameFocused) {
      this.nameValueLabel.font = nameSelected
        ? FONT_VALUE_SELECTED_LEFT.clone()
        : FONT_VALUE_LEFT.clone();
      this.nameValueLabel.color = nameSelected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      this.refreshNameDisplay();
    }

    // Option rows (index 1..optionRows.length)
    for (let i = 0; i < this.optionRowUIs.length; i++) {
      const row = this.optionRowUIs[i];
      const selected = i + 1 === this.selectedRow;
      row.leftArrow.font = selected ? FONT_ARROW_SELECTED.clone() : FONT_ARROW.clone();
      row.leftArrow.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.fromHex("#666666");
      row.valueLabel.font = selected ? FONT_VALUE_SELECTED.clone() : FONT_VALUE.clone();
      row.valueLabel.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      row.rightArrow.font = selected ? FONT_ARROW_SELECTED.clone() : FONT_ARROW.clone();
      row.rightArrow.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.fromHex("#666666");
    }

    // Button rows (index optionRows.length+1..)
    for (let i = 0; i < this.buttonLabels.length; i++) {
      const selected = this.selectedRow === 1 + this.optionRows.length + i;
      const label = this.buttonLabels[i];
      label.font = selected ? FONT_BUTTON_SELECTED.clone() : FONT_BUTTON.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      label.text = selected ? `> ${BUTTON_LABELS[i]} <` : BUTTON_LABELS[i];
    }
  }

  private activateButton(engine: ex.Engine): void {
    const buttonIndex = this.selectedRow - 1 - this.optionRows.length; // -1 for name row
    if (buttonIndex === 0) {
      this.randomize();
    } else if (buttonIndex === 1) {
      const name = this.playerName.trim() || "Villager";
      void engine.goToScene("game-world", {
        sceneActivationData: {
          type: "new" as const,
          appearance: this.appearance,
          playerName: name,
        },
      });
    } else if (buttonIndex === 2) {
      void engine.goToScene("start");
    }
  }

  private randomize(): void {
    const sex = Math.random() > 0.5 ? "male" : "female";
    this.appearance = {
      sex,
      skinTone: Math.floor(Math.random() * SKIN_TONES.length),
      hairStyle: Math.floor(Math.random() * HAIR_STYLES.length),
      hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
      facialHair: sex === "male" ? Math.floor(Math.random() * FACIAL_HAIR_STYLES.length) : 0,
      equipmentColors: {
        torso: Math.floor(Math.random() * CLOTHING_COLORS.length),
        legs: Math.floor(Math.random() * CLOTHING_COLORS.length),
        feet: Math.floor(Math.random() * CLOTHING_COLORS.length),
      },
    };
    this.rebuildOptionRows();
    this.updatePreview();
  }
}
