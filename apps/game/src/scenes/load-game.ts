import * as ex from "excalibur";
import { wasActionPressed } from "../systems/keybinds.ts";
import {
  type SaveData,
  deleteSave,
  exportSaveToFile,
  importSaveFromFile,
  listSaves,
} from "../systems/save-manager.ts";
import { UI_REF_HEIGHT } from "../systems/ui-scale.ts";

const FONT_TITLE = new ex.Font({
  family: "monospace",
  size: 36,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_EMPTY = new ex.Font({
  family: "monospace",
  size: 18,
  color: ex.Color.fromHex("#888888"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_SAVE = new ex.Font({
  family: "monospace",
  size: 18,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_SAVE_SELECTED = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_BUTTON = new ex.Font({
  family: "monospace",
  size: 20,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_BUTTON_SELECTED = new ex.Font({
  family: "monospace",
  size: 20,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_STATUS = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.fromHex("#ff6060"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const MAX_VISIBLE = 8;
const BUTTON_LABELS = ["Load", "Delete", "Export", "Import", "Back"];

type Mode = "saves" | "buttons" | "confirm-delete";

interface LoadGameData {
  returnTo: string;
}

export class LoadGame extends ex.Scene<LoadGameData> {
  private returnTo = "start";
  private saves: SaveData[] = [];
  private saveLabels: ex.Label[] = [];
  private buttonLabels: ex.Label[] = [];
  private emptyLabel!: ex.Label;
  private statusLabel!: ex.Label;
  private confirmLabel!: ex.Label;
  private allActors: ex.Actor[] = [];
  private mode: Mode = "saves";
  private selectedSave = 0;
  private selectedButton = 0;
  private scrollOffset = 0;
  private centerX = 0;

  override onInitialize(engine: ex.Engine): void {
    this.centerX = engine.drawWidth / 2;
    const leftX = this.centerX - 200;

    const title = new ex.Label({
      text: "Load Game",
      pos: ex.vec(this.centerX, 35),
      font: FONT_TITLE,
    });
    this.add(title);
    this.allActors.push(title);

    this.emptyLabel = new ex.Label({
      text: "No saves found.",
      pos: ex.vec(this.centerX, 180),
      font: FONT_EMPTY,
    });
    this.add(this.emptyLabel);
    this.allActors.push(this.emptyLabel);

    for (let i = 0; i < MAX_VISIBLE; i++) {
      const label = new ex.Label({
        text: "",
        pos: ex.vec(leftX + 20, 80 + i * 30),
        font: FONT_SAVE.clone(),
      });
      label.on("pointerdown", () => {
        this.mode = "saves";
        this.selectedSave = this.scrollOffset + i;
        this.updateDisplay();
      });
      this.add(label);
      this.allActors.push(label);
      this.saveLabels.push(label);
    }

    this.statusLabel = new ex.Label({
      text: "",
      pos: ex.vec(this.centerX, 365),
      font: FONT_STATUS,
    });
    this.add(this.statusLabel);
    this.allActors.push(this.statusLabel);

    this.confirmLabel = new ex.Label({
      text: "",
      pos: ex.vec(this.centerX, 340),
      font: new ex.Font({
        family: "monospace",
        size: 18,
        bold: true,
        color: ex.Color.fromHex("#ff6060"),
        textAlign: ex.TextAlign.Center,
        baseAlign: ex.BaseAlign.Middle,
      }),
    });
    this.add(this.confirmLabel);
    this.allActors.push(this.confirmLabel);

    // Buttons
    const buttonY = 330;
    const spacing = 90;
    const startX = this.centerX - ((BUTTON_LABELS.length - 1) * spacing) / 2;
    for (let i = 0; i < BUTTON_LABELS.length; i++) {
      const label = new ex.Label({
        text: BUTTON_LABELS[i],
        pos: ex.vec(startX + i * spacing, buttonY),
        font: FONT_BUTTON.clone(),
      });
      label.on("pointerdown", () => {
        this.mode = "buttons";
        this.selectedButton = i;
        this.activateButton(engine);
      });
      this.add(label);
      this.allActors.push(label);
      this.buttonLabels.push(label);
    }
  }

  override async onActivate(context: ex.SceneActivationContext<LoadGameData>): Promise<void> {
    const vh = this.engine.drawHeight * this.camera.zoom;
    this.camera.zoom = vh / UI_REF_HEIGHT;
    this.camera.pos = ex.vec(this.centerX, UI_REF_HEIGHT / 2);
    this.returnTo = context.data?.returnTo ?? "start";
    this.mode = "saves";
    this.selectedSave = 0;
    this.selectedButton = 0;
    this.scrollOffset = 0;
    this.statusLabel.text = "";
    this.confirmLabel.text = "";
    this.saves = await listSaves();
    if (this.saves.length === 0) this.mode = "buttons";
    this.updateDisplay();
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    if (this.mode === "confirm-delete") {
      if (wasActionPressed(kb, "confirm")) {
        void this.doDelete(engine);
      } else if (
        wasActionPressed(kb, "back") ||
        wasActionPressed(kb, "moveUp") ||
        wasActionPressed(kb, "moveDown")
      ) {
        this.mode = "buttons";
        this.confirmLabel.text = "";
        this.updateDisplay();
      }
      return;
    }

    if (wasActionPressed(kb, "back")) {
      void engine.goToScene(this.returnTo);
      return;
    }

    if (this.mode === "saves") {
      if (wasActionPressed(kb, "moveUp")) {
        if (this.selectedSave > 0) {
          this.selectedSave--;
          if (this.selectedSave < this.scrollOffset) this.scrollOffset = this.selectedSave;
          this.updateDisplay();
        }
      }
      if (wasActionPressed(kb, "moveDown")) {
        if (this.selectedSave < this.saves.length - 1) {
          this.selectedSave++;
          if (this.selectedSave >= this.scrollOffset + MAX_VISIBLE) {
            this.scrollOffset = this.selectedSave - MAX_VISIBLE + 1;
          }
          this.updateDisplay();
        } else {
          this.mode = "buttons";
          this.selectedButton = 0;
          this.updateDisplay();
        }
      }
      if (wasActionPressed(kb, "confirm")) {
        this.doLoad(engine);
      }
    } else if (this.mode === "buttons") {
      if (wasActionPressed(kb, "moveLeft")) {
        this.selectedButton = Math.max(0, this.selectedButton - 1);
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "moveRight")) {
        this.selectedButton = Math.min(BUTTON_LABELS.length - 1, this.selectedButton + 1);
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "moveUp")) {
        if (this.saves.length > 0) {
          this.mode = "saves";
          this.updateDisplay();
        }
      }
      if (wasActionPressed(kb, "confirm")) {
        this.activateButton(engine);
      }
    }
  }

  private doLoad(engine: ex.Engine): void {
    if (this.saves.length === 0) return;
    const save = this.saves[this.selectedSave];
    void engine.goToScene("game-world", {
      sceneActivationData: { type: "load" as const, save },
    });
  }

  private async doDelete(_engine: ex.Engine): Promise<void> {
    const save = this.saves[this.selectedSave];
    if (!save) return;
    await deleteSave(save.name);
    this.saves = await listSaves();
    this.confirmLabel.text = "";
    if (this.selectedSave >= this.saves.length) {
      this.selectedSave = Math.max(0, this.saves.length - 1);
    }
    if (this.saves.length === 0) this.mode = "buttons";
    this.updateDisplay();
  }

  private activateButton(engine: ex.Engine): void {
    switch (this.selectedButton) {
      case 0:
        this.doLoad(engine);
        break;
      case 1:
        if (this.saves.length > 0) {
          this.mode = "confirm-delete";
          this.confirmLabel.text = `Delete "${this.saves[this.selectedSave]?.name}"? Press Confirm.`;
          this.updateDisplay();
        }
        break;
      case 2:
        if (this.saves.length > 0) {
          exportSaveToFile(this.saves[this.selectedSave]);
        }
        break;
      case 3:
        void this.doImport();
        break;
      case 4:
        void engine.goToScene(this.returnTo);
        break;
    }
  }

  private async doImport(): Promise<void> {
    const imported = await importSaveFromFile();
    if (imported) {
      this.saves = await listSaves();
      this.statusLabel.text = `Imported "${imported.name}"`;
      this.updateDisplay();
    }
  }

  private updateDisplay(): void {
    this.emptyLabel.text = this.saves.length === 0 ? "No saves found." : "";

    for (let i = 0; i < MAX_VISIBLE; i++) {
      const saveIdx = this.scrollOffset + i;
      const label = this.saveLabels[i];
      if (saveIdx < this.saves.length) {
        const save = this.saves[saveIdx];
        const date = new Date(save.timestamp).toLocaleString();
        label.text = `${save.name}  -  ${date}`;
        const selected = this.mode === "saves" && saveIdx === this.selectedSave;
        label.font = selected ? FONT_SAVE_SELECTED.clone() : FONT_SAVE.clone();
        label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      } else {
        label.text = "";
      }
    }

    for (let i = 0; i < this.buttonLabels.length; i++) {
      const selected = this.mode === "buttons" && this.selectedButton === i;
      const label = this.buttonLabels[i];
      label.font = selected ? FONT_BUTTON_SELECTED.clone() : FONT_BUTTON.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      label.text = selected ? `> ${BUTTON_LABELS[i]} <` : BUTTON_LABELS[i];
    }
  }
}
