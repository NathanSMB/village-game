import * as ex from "excalibur";
import { wasActionPressed } from "../systems/keybinds.ts";
import { type SaveData, listSaves, saveGame } from "../systems/save-manager.ts";
import type { GameWorld } from "./game-world.ts";

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
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_INPUT = new ex.Font({
  family: "monospace",
  size: 20,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_INPUT_ACTIVE = new ex.Font({
  family: "monospace",
  size: 20,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_INPUT_TYPING = new ex.Font({
  family: "monospace",
  size: 20,
  bold: true,
  color: ex.Color.fromHex("#66cc66"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_SAVE_ENTRY = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_SAVE_ENTRY_SELECTED = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
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

const FONT_STATUS = new ex.Font({
  family: "monospace",
  size: 16,
  color: ex.Color.fromHex("#66cc66"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const MAX_NAME_LENGTH = 24;
const MAX_VISIBLE_SAVES = 6;
const BUTTON_LABELS = ["Save", "Back"];

// "nav" = normal navigation, "typing" = capturing keyboard for text input
type Mode = "nav" | "typing";

// Which section is focused during nav mode
type Section = "name" | "saves" | "buttons";

export class SaveGame extends ex.Scene {
  private saveName = "";
  private saves: SaveData[] = [];
  private saveLabels: ex.Label[] = [];
  private allActors: ex.Actor[] = [];
  private inputLabel!: ex.Label;
  private cursorLabel!: ex.Label;
  private statusLabel!: ex.Label;
  private buttonLabels: ex.Label[] = [];
  private mode: Mode = "nav";
  private section: Section = "name";
  private selectedSave = 0;
  private selectedButton = 0;
  private scrollOffset = 0;
  private centerX = 0;

  override onInitialize(engine: ex.Engine): void {
    this.centerX = engine.drawWidth / 2;
    const leftX = this.centerX - 180;

    const title = new ex.Label({
      text: "Save Game",
      pos: ex.vec(this.centerX, 35),
      font: FONT_TITLE,
    });
    this.add(title);
    this.allActors.push(title);

    const nameLabel = new ex.Label({
      text: "Name:",
      pos: ex.vec(leftX, 80),
      font: FONT_LABEL,
    });
    this.add(nameLabel);
    this.allActors.push(nameLabel);

    this.inputLabel = new ex.Label({
      text: "",
      pos: ex.vec(leftX + 70, 80),
      font: FONT_INPUT,
    });
    this.inputLabel.on("pointerdown", () => {
      this.section = "name";
      this.mode = "typing";
      this.updateDisplay();
    });
    this.add(this.inputLabel);
    this.allActors.push(this.inputLabel);

    this.cursorLabel = new ex.Label({
      text: "_",
      pos: ex.vec(leftX + 70, 80),
      font: FONT_INPUT,
    });
    this.add(this.cursorLabel);
    this.allActors.push(this.cursorLabel);

    const savesHeader = new ex.Label({
      text: "Existing saves:",
      pos: ex.vec(leftX, 115),
      font: FONT_LABEL,
    });
    this.add(savesHeader);
    this.allActors.push(savesHeader);

    this.statusLabel = new ex.Label({
      text: "",
      pos: ex.vec(this.centerX, 350),
      font: FONT_STATUS,
    });
    this.add(this.statusLabel);
    this.allActors.push(this.statusLabel);

    for (let i = 0; i < MAX_VISIBLE_SAVES; i++) {
      const label = new ex.Label({
        text: "",
        pos: ex.vec(leftX + 10, 140 + i * 26),
        font: FONT_SAVE_ENTRY.clone(),
      });
      label.on("pointerdown", () => {
        this.section = "saves";
        this.mode = "nav";
        this.selectedSave = this.scrollOffset + i;
        this.saveName = this.saves[this.selectedSave]?.name ?? this.saveName;
        this.updateDisplay();
      });
      this.add(label);
      this.allActors.push(label);
      this.saveLabels.push(label);
    }

    const buttonY = 310;
    for (let i = 0; i < BUTTON_LABELS.length; i++) {
      const label = new ex.Label({
        text: BUTTON_LABELS[i],
        pos: ex.vec(this.centerX - 60 + i * 120, buttonY),
        font: FONT_BUTTON.clone(),
      });
      label.on("pointerdown", () => {
        this.section = "buttons";
        this.mode = "nav";
        this.selectedButton = i;
        this.activateButton(engine);
      });
      this.add(label);
      this.allActors.push(label);
      this.buttonLabels.push(label);
    }
  }

  override async onActivate(): Promise<void> {
    this.saveName = "";
    this.mode = "nav";
    this.section = "name";
    this.selectedSave = 0;
    this.selectedButton = 0;
    this.scrollOffset = 0;
    this.statusLabel.text = "";
    this.saves = await listSaves();
    this.updateDisplay();
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    if (this.mode === "typing") {
      this.handleTextInput(kb);
      return;
    }

    // Nav mode
    if (wasActionPressed(kb, "back")) {
      void engine.goToScene("pause-menu");
      return;
    }

    if (this.section === "name") {
      if (wasActionPressed(kb, "confirm")) {
        this.mode = "typing";
        this.updateDisplay();
        return;
      }
      if (wasActionPressed(kb, "moveDown")) {
        this.section = this.saves.length > 0 ? "saves" : "buttons";
        this.updateDisplay();
      }
    } else if (this.section === "saves") {
      if (wasActionPressed(kb, "moveUp")) {
        if (this.selectedSave > 0) {
          this.selectedSave--;
          if (this.selectedSave < this.scrollOffset) this.scrollOffset = this.selectedSave;
        } else {
          this.section = "name";
        }
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "moveDown")) {
        if (this.selectedSave < this.saves.length - 1) {
          this.selectedSave++;
          if (this.selectedSave >= this.scrollOffset + MAX_VISIBLE_SAVES) {
            this.scrollOffset = this.selectedSave - MAX_VISIBLE_SAVES + 1;
          }
        } else {
          this.section = "buttons";
        }
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "confirm")) {
        this.saveName = this.saves[this.selectedSave]?.name ?? this.saveName;
        this.section = "name";
        this.mode = "typing";
        this.updateDisplay();
      }
    } else if (this.section === "buttons") {
      if (wasActionPressed(kb, "moveLeft")) {
        this.selectedButton = Math.max(0, this.selectedButton - 1);
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "moveRight")) {
        this.selectedButton = Math.min(BUTTON_LABELS.length - 1, this.selectedButton + 1);
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "moveUp")) {
        this.section = this.saves.length > 0 ? "saves" : "name";
        this.updateDisplay();
      }
      if (wasActionPressed(kb, "confirm")) {
        this.activateButton(engine);
      }
    }
  }

  private handleTextInput(kb: ex.Keyboard): void {
    // Enter or Escape exits typing mode
    if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Escape)) {
      this.mode = "nav";
      this.updateDisplay();
      return;
    }

    if (kb.wasPressed(ex.Keys.Backspace)) {
      this.saveName = this.saveName.slice(0, -1);
      this.updateDisplay();
      return;
    }

    const pressed = kb.getKeys();
    for (const key of pressed) {
      if (!kb.wasPressed(key)) continue;
      const ch = this.keyToChar(key, kb.isHeld(ex.Keys.ShiftLeft) || kb.isHeld(ex.Keys.ShiftRight));
      if (ch && this.saveName.length < MAX_NAME_LENGTH) {
        this.saveName += ch;
        this.updateDisplay();
        break;
      }
    }
  }

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

  private async doSave(engine: ex.Engine): Promise<void> {
    if (this.saveName.trim().length === 0) {
      this.statusLabel.text = "Enter a name first.";
      return;
    }

    const gameWorld = engine.scenes["game-world"] as GameWorld;
    const playerState = gameWorld.getPlayerState();
    if (!playerState) {
      this.statusLabel.text = "No game to save.";
      return;
    }

    const data: SaveData = {
      name: this.saveName.trim(),
      timestamp: Date.now(),
      player: playerState,
      bushes: gameWorld.getBushStates(),
      trees: gameWorld.getTreeStates(),
      rocks: gameWorld.getRockStates(),
      groundItems: gameWorld.getGroundItemStates(),
      buildings: gameWorld.getBuildingStates(),
    };

    await saveGame(data);
    this.statusLabel.text = `Saved "${data.name}"`;
    this.saves = await listSaves();
    this.updateDisplay();
  }

  private activateButton(engine: ex.Engine): void {
    if (this.selectedButton === 0) {
      void this.doSave(engine);
    } else {
      void engine.goToScene("pause-menu");
    }
  }

  private updateDisplay(): void {
    // Input field
    this.inputLabel.text = this.saveName || "(empty)";
    const inputWidth = (this.saveName || "(empty)").length * 12;
    this.cursorLabel.pos = ex.vec(this.inputLabel.pos.x + inputWidth + 2, this.inputLabel.pos.y);

    if (this.mode === "typing") {
      this.inputLabel.font = FONT_INPUT_TYPING.clone();
      this.inputLabel.color = ex.Color.fromHex("#66cc66");
      this.cursorLabel.color = ex.Color.fromHex("#66cc66");
    } else if (this.section === "name") {
      this.inputLabel.font = FONT_INPUT_ACTIVE.clone();
      this.inputLabel.color = ex.Color.fromHex("#f0c040");
      this.cursorLabel.color = ex.Color.Transparent;
    } else {
      this.inputLabel.font = FONT_INPUT.clone();
      this.inputLabel.color = ex.Color.White;
      this.cursorLabel.color = ex.Color.Transparent;
    }

    // Save entries
    for (let i = 0; i < MAX_VISIBLE_SAVES; i++) {
      const saveIdx = this.scrollOffset + i;
      const label = this.saveLabels[i];
      if (saveIdx < this.saves.length) {
        const save = this.saves[saveIdx];
        const date = new Date(save.timestamp).toLocaleString();
        label.text = `${save.name}  -  ${date}`;
        const selected =
          this.section === "saves" && saveIdx === this.selectedSave && this.mode === "nav";
        label.font = selected ? FONT_SAVE_ENTRY_SELECTED.clone() : FONT_SAVE_ENTRY.clone();
        label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      } else {
        label.text = "";
      }
    }

    // Buttons
    for (let i = 0; i < this.buttonLabels.length; i++) {
      const selected =
        this.section === "buttons" && this.selectedButton === i && this.mode === "nav";
      const label = this.buttonLabels[i];
      label.font = selected ? FONT_BUTTON_SELECTED.clone() : FONT_BUTTON.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      label.text = selected ? `> ${BUTTON_LABELS[i]} <` : BUTTON_LABELS[i];
    }
  }
}
