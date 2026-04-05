import * as ex from "excalibur";
import {
  ACTION_LABELS,
  ALL_ACTIONS,
  getBindings,
  keyDisplayName,
  persistKeybinds,
  resetBindings,
  setBinding,
  type ActionName,
} from "../systems/keybinds.ts";
import { UI_REF_HEIGHT } from "../systems/ui-scale.ts";

interface SettingsData {
  returnTo: string;
}

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
  size: 16,
  color: ex.Color.fromHex("#aaaaaa"),
  textAlign: ex.TextAlign.Right,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_KEY = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_KEY_SELECTED = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_KEY_LISTENING = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.fromHex("#ff6060"),
  textAlign: ex.TextAlign.Center,
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

interface BindRowUI {
  slot1Label: ex.Label;
  slot2Label: ex.Label;
}

const BUTTON_LABELS = ["Reset to Defaults", "Back"];

export class Settings extends ex.Scene<SettingsData> {
  private returnTo = "start";
  private selectedRow = 0;
  private selectedSlot: 0 | 1 = 0; // 0 = slot1, 1 = slot2
  private listening = false;
  private listenReady = false;
  private listenKey: ex.Keys | null = null;
  private bindRowUIs: BindRowUI[] = [];
  private buttonLabels: ex.Label[] = [];
  private allLabels: ex.Label[] = []; // for cleanup

  private get totalRows(): number {
    return ALL_ACTIONS.length + BUTTON_LABELS.length;
  }

  override onInitialize(engine: ex.Engine): void {
    const centerX = engine.drawWidth / 2;

    const title = new ex.Label({
      text: "Settings",
      pos: ex.vec(centerX, 35),
      font: FONT_TITLE,
    });
    this.add(title);
    this.allLabels.push(title);

    this.buildBindRows(engine);
    this.buildButtons(engine);
  }

  override onActivate(context: ex.SceneActivationContext<SettingsData>): void {
    const vw = this.engine.drawWidth * this.camera.zoom;
    const vh = this.engine.drawHeight * this.camera.zoom;
    this.camera.zoom = vh / UI_REF_HEIGHT;
    this.camera.pos = ex.vec(vw / 2, UI_REF_HEIGHT / 2);
    this.returnTo = context.data?.returnTo ?? "start";
    this.selectedRow = 0;
    this.selectedSlot = 0;
    this.listening = false;
    this.listenReady = false;
    this.listenKey = null;
    this.refreshAllSlots();
    this.updateSelection();
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    if (this.listening) {
      const held = kb.getKeys();

      // Wait for all keys to be released before accepting input
      if (!this.listenReady) {
        if (held.length === 0) {
          this.listenReady = true;
        }
        return;
      }

      // Track the first new key pressed, bind on its release
      if (held.length > 0 && this.listenKey == null) {
        this.listenKey = held[0];
      }

      if (this.listenKey != null && kb.wasReleased(this.listenKey)) {
        const action = ALL_ACTIONS[this.selectedRow];
        const slot = this.selectedSlot === 0 ? 1 : 2;
        setBinding(action, slot as 1 | 2, this.listenKey);
        this.listening = false;
        this.listenKey = null;
        this.listenReady = false;
        this.refreshAllSlots();
        this.updateSelection();
        void persistKeybinds();
      }
      return;
    }

    // Normal navigation
    if (kb.wasPressed(ex.Keys.Escape)) {
      void engine.goToScene(this.returnTo);
      return;
    }

    if (kb.wasPressed(ex.Keys.ArrowUp) || kb.wasPressed(ex.Keys.W)) {
      this.selectedRow = (this.selectedRow - 1 + this.totalRows) % this.totalRows;
      this.selectedSlot = 0;
      this.updateSelection();
    }

    if (kb.wasPressed(ex.Keys.ArrowDown) || kb.wasPressed(ex.Keys.S)) {
      this.selectedRow = (this.selectedRow + 1) % this.totalRows;
      this.selectedSlot = 0;
      this.updateSelection();
    }

    // Left/right to switch slots (only on bind rows)
    if (this.selectedRow < ALL_ACTIONS.length) {
      if (kb.wasPressed(ex.Keys.ArrowLeft) || kb.wasPressed(ex.Keys.A)) {
        this.selectedSlot = 0;
        this.updateSelection();
      }
      if (kb.wasPressed(ex.Keys.ArrowRight) || kb.wasPressed(ex.Keys.D)) {
        this.selectedSlot = 1;
        this.updateSelection();
      }
    }

    if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Space)) {
      if (this.selectedRow < ALL_ACTIONS.length) {
        this.listening = true;
        this.listenKey = null;
        this.updateSelection();
      } else {
        this.activateButton(engine);
      }
    }

    // Delete/Backspace to clear a slot
    if (kb.wasPressed(ex.Keys.Delete) || kb.wasPressed(ex.Keys.Backspace)) {
      if (this.selectedRow < ALL_ACTIONS.length) {
        const action = ALL_ACTIONS[this.selectedRow];
        const slot = this.selectedSlot === 0 ? 1 : 2;
        setBinding(action, slot as 1 | 2, null);
        this.refreshAllSlots();
        this.updateSelection();
        void persistKeybinds();
      }
    }
  }

  private buildBindRows(engine: ex.Engine): void {
    const centerX = engine.drawWidth / 2;
    const labelX = centerX - 40;
    const slot1X = centerX + 40;
    const slot2X = centerX + 160;
    const startY = 85;
    const rowSpacing = 30;

    for (let i = 0; i < ALL_ACTIONS.length; i++) {
      const action = ALL_ACTIONS[i];
      const y = startY + i * rowSpacing;

      const categoryLabel = new ex.Label({
        text: ACTION_LABELS[action] + ":",
        pos: ex.vec(labelX, y),
        font: FONT_LABEL,
      });
      this.add(categoryLabel);
      this.allLabels.push(categoryLabel);

      const slot1Label = new ex.Label({
        text: this.getSlotText(action, 1),
        pos: ex.vec(slot1X, y),
        font: FONT_KEY.clone(),
      });
      slot1Label.on("pointerdown", () => {
        this.selectedRow = i;
        this.selectedSlot = 0;
        this.listening = true;
        this.listenKey = null;
        this.updateSelection();
      });
      this.add(slot1Label);
      this.allLabels.push(slot1Label);

      const slot2Label = new ex.Label({
        text: this.getSlotText(action, 2),
        pos: ex.vec(slot2X, y),
        font: FONT_KEY.clone(),
      });
      slot2Label.on("pointerdown", () => {
        this.selectedRow = i;
        this.selectedSlot = 1;
        this.listening = true;
        this.listenKey = null;
        this.updateSelection();
      });
      this.add(slot2Label);
      this.allLabels.push(slot2Label);

      this.bindRowUIs.push({ slot1Label, slot2Label });
    }
  }

  private buildButtons(engine: ex.Engine): void {
    const centerX = engine.drawWidth / 2;
    const startY = 85 + ALL_ACTIONS.length * 30 + 30;
    const buttonSpacing = 36;

    for (let i = 0; i < BUTTON_LABELS.length; i++) {
      const label = new ex.Label({
        text: BUTTON_LABELS[i],
        pos: ex.vec(centerX, startY + i * buttonSpacing),
        font: FONT_BUTTON.clone(),
      });

      label.on("pointerdown", () => {
        this.selectedRow = ALL_ACTIONS.length + i;
        this.activateButton(engine);
      });

      label.on("pointerenter", () => {
        this.selectedRow = ALL_ACTIONS.length + i;
        this.updateSelection();
      });

      this.buttonLabels.push(label);
      this.allLabels.push(label);
      this.add(label);
    }
  }

  private getSlotText(action: ActionName, slot: 1 | 2): string {
    const bindings = getBindings();
    const key = slot === 1 ? bindings[action].slot1 : bindings[action].slot2;
    return `[ ${keyDisplayName(key)} ]`;
  }

  private refreshAllSlots(): void {
    for (let i = 0; i < ALL_ACTIONS.length; i++) {
      const action = ALL_ACTIONS[i];
      this.bindRowUIs[i].slot1Label.text = this.getSlotText(action, 1);
      this.bindRowUIs[i].slot2Label.text = this.getSlotText(action, 2);
    }
  }

  private updateSelection(): void {
    for (let i = 0; i < this.bindRowUIs.length; i++) {
      const row = this.bindRowUIs[i];
      const isSelectedRow = i === this.selectedRow;

      if (isSelectedRow && this.listening) {
        const listeningLabel = this.selectedSlot === 0 ? row.slot1Label : row.slot2Label;
        const otherLabel = this.selectedSlot === 0 ? row.slot2Label : row.slot1Label;
        listeningLabel.font = FONT_KEY_LISTENING.clone();
        listeningLabel.color = ex.Color.fromHex("#ff6060");
        listeningLabel.text = "[ ... ]";
        otherLabel.font = FONT_KEY.clone();
        otherLabel.color = ex.Color.White;
      } else if (isSelectedRow) {
        const selectedLabel = this.selectedSlot === 0 ? row.slot1Label : row.slot2Label;
        const otherLabel = this.selectedSlot === 0 ? row.slot2Label : row.slot1Label;
        selectedLabel.font = FONT_KEY_SELECTED.clone();
        selectedLabel.color = ex.Color.fromHex("#f0c040");
        otherLabel.font = FONT_KEY.clone();
        otherLabel.color = ex.Color.White;
      } else {
        row.slot1Label.font = FONT_KEY.clone();
        row.slot1Label.color = ex.Color.White;
        row.slot2Label.font = FONT_KEY.clone();
        row.slot2Label.color = ex.Color.White;
      }
    }

    for (let i = 0; i < this.buttonLabels.length; i++) {
      const selected = this.selectedRow === ALL_ACTIONS.length + i;
      const label = this.buttonLabels[i];
      label.font = selected ? FONT_BUTTON_SELECTED.clone() : FONT_BUTTON.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      label.text = selected ? `> ${BUTTON_LABELS[i]} <` : BUTTON_LABELS[i];
    }
  }

  private activateButton(engine: ex.Engine): void {
    const buttonIndex = this.selectedRow - ALL_ACTIONS.length;
    if (buttonIndex === 0) {
      resetBindings();
      this.refreshAllSlots();
      this.updateSelection();
      persistKeybinds();
    } else if (buttonIndex === 1) {
      void engine.goToScene(this.returnTo);
    }
  }
}
