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

// ── Fonts ────────────────────────────────────────────────────────────

const FONT_TITLE = new ex.Font({
  family: "monospace",
  size: 36,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_TAB = new ex.Font({
  family: "monospace",
  size: 18,
  color: ex.Color.fromHex("#666666"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_TAB_ACTIVE = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_TAB_SELECTED = new ex.Font({
  family: "monospace",
  size: 18,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
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

// ── Tab / button definitions ─────────────────────────────────────────

const TAB_NAMES = ["Display", "Keybinds"] as const;
type TabName = (typeof TAB_NAMES)[number];

const DISPLAY_BUTTONS = ["Back"];
const KEYBIND_BUTTONS = ["Reset to Defaults", "Back"];

type Section = "tabs" | "content" | "buttons";

interface BindRowUI {
  slot1Label: ex.Label;
  slot2Label: ex.Label;
}

// ── Scene ────────────────────────────────────────────────────────────

export class Settings extends ex.Scene<SettingsData> {
  private returnTo = "start";
  private centerX = 0;

  // Navigation state
  private activeTabIndex = 0;
  private section: Section = "tabs";

  // Tab bar
  private tabLabels: ex.Label[] = [];

  // Display tab
  private displayElements: ex.Label[] = []; // visibility group
  private displayButtonLabels: ex.Label[] = [];
  private displayContentRow = 0;
  private displayButtonIndex = 0;
  private fullscreenValueLabel!: ex.Label;

  // Keybinds tab
  private keybindElements: ex.Label[] = []; // visibility group
  private keybindButtonLabels: ex.Label[] = [];
  private bindRowUIs: BindRowUI[] = [];
  private keybindContentRow = 0;
  private keybindButtonIndex = 0;
  private selectedSlot: 0 | 1 = 0;
  private listening = false;
  private listenReady = false;
  private listenKey: ex.Keys | null = null;

  private get activeTab(): TabName {
    return TAB_NAMES[this.activeTabIndex];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  override onInitialize(engine: ex.Engine): void {
    this.centerX = engine.drawWidth / 2;

    const title = new ex.Label({
      text: "Settings",
      pos: ex.vec(this.centerX, 35),
      font: FONT_TITLE,
    });
    this.add(title);

    this.buildTabBar();
    this.buildDisplayContent();
    this.buildKeybindContent();
    this.buildKeybindButtons();
    this.switchTab(0);
  }

  override onActivate(context: ex.SceneActivationContext<SettingsData>): void {
    const vh = this.engine.drawHeight * this.camera.zoom;
    this.camera.zoom = vh / UI_REF_HEIGHT;
    this.camera.pos = ex.vec(this.centerX, UI_REF_HEIGHT / 2);
    this.returnTo = context.data?.returnTo ?? "start";
    this.activeTabIndex = 0;
    this.section = "tabs";
    this.displayContentRow = 0;
    this.displayButtonIndex = 0;
    this.keybindContentRow = 0;
    this.keybindButtonIndex = 0;
    this.selectedSlot = 0;
    this.listening = false;
    this.listenReady = false;
    this.listenKey = null;
    this.refreshAllSlots();
    this.updateFullscreenLabel();
    this.switchTab(0);
    this.updateSelection();
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    // Keybind listening mode captures all input
    if (this.listening) {
      this.handleListening(kb);
      return;
    }

    // Tab / Escape goes back
    if (kb.wasPressed(ex.Keys.Tab) || kb.wasPressed(ex.Keys.Escape)) {
      void engine.goToScene(this.returnTo);
      return;
    }

    if (this.section === "tabs") {
      this.handleTabsInput(kb);
    } else if (this.section === "content") {
      if (this.activeTab === "Display") {
        this.handleDisplayContentInput(kb);
      } else {
        this.handleKeybindContentInput(kb);
      }
    } else {
      if (this.activeTab === "Display") {
        this.handleDisplayButtonInput(kb);
      } else {
        this.handleKeybindButtonInput(kb);
      }
    }
  }

  // ── Tab bar ────────────────────────────────────────────────────────

  private buildTabBar(): void {
    const spacing = 100;
    const startX = this.centerX - ((TAB_NAMES.length - 1) * spacing) / 2;

    for (let i = 0; i < TAB_NAMES.length; i++) {
      const label = new ex.Label({
        text: TAB_NAMES[i],
        pos: ex.vec(startX + i * spacing, 65),
        font: FONT_TAB.clone(),
      });
      label.on("pointerdown", () => {
        this.section = "tabs";
        this.switchTab(i);
        this.updateSelection();
      });
      this.tabLabels.push(label);
      this.add(label);
    }
  }

  private switchTab(index: number): void {
    this.activeTabIndex = index;

    const showDisplay = this.activeTab === "Display";
    for (const el of this.displayElements) el.graphics.visible = showDisplay;

    const showKeybinds = this.activeTab === "Keybinds";
    for (const el of this.keybindElements) el.graphics.visible = showKeybinds;

    if (showDisplay) this.updateFullscreenLabel();

    // Reset content selection when switching
    this.displayContentRow = 0;
    this.displayButtonIndex = 0;
    this.keybindContentRow = 0;
    this.keybindButtonIndex = 0;
    this.selectedSlot = 0;

    this.updateSelection();
  }

  private handleTabsInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.ArrowLeft) || kb.wasPressed(ex.Keys.A)) {
      this.switchTab((this.activeTabIndex - 1 + TAB_NAMES.length) % TAB_NAMES.length);
    }
    if (kb.wasPressed(ex.Keys.ArrowRight) || kb.wasPressed(ex.Keys.D)) {
      this.switchTab((this.activeTabIndex + 1) % TAB_NAMES.length);
    }
    if (kb.wasPressed(ex.Keys.ArrowDown) || kb.wasPressed(ex.Keys.S)) {
      this.section = "content";
      this.updateSelection();
    }
    if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Space)) {
      this.section = "content";
      this.updateSelection();
    }
  }

  // ── Display tab ────────────────────────────────────────────────────

  private buildDisplayContent(): void {
    const labelX = this.centerX - 40;
    const valueX = this.centerX + 60;
    const y = 120;

    const fsLabel = new ex.Label({
      text: "Fullscreen:",
      pos: ex.vec(labelX, y),
      font: FONT_LABEL,
    });
    this.add(fsLabel);
    this.displayElements.push(fsLabel);

    this.fullscreenValueLabel = new ex.Label({
      text: "[ Off ]",
      pos: ex.vec(valueX, y),
      font: FONT_KEY.clone(),
    });
    this.fullscreenValueLabel.on("pointerdown", () => {
      this.section = "content";
      this.displayContentRow = 0;
      this.toggleFullscreen();
      this.updateSelection();
    });
    this.add(this.fullscreenValueLabel);
    this.displayElements.push(this.fullscreenValueLabel);

    // Back button
    const backLabel = new ex.Label({
      text: "Back",
      pos: ex.vec(this.centerX, 200),
      font: FONT_BUTTON.clone(),
    });
    backLabel.on("pointerdown", () => {
      void this.engine.goToScene(this.returnTo);
    });
    backLabel.on("pointerenter", () => {
      this.section = "buttons";
      this.displayButtonIndex = 0;
      this.updateSelection();
    });
    this.add(backLabel);
    this.displayElements.push(backLabel);
    this.displayButtonLabels.push(backLabel);
  }

  private handleDisplayContentInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.ArrowUp) || kb.wasPressed(ex.Keys.W)) {
      this.section = "tabs";
      this.updateSelection();
      return;
    }
    if (kb.wasPressed(ex.Keys.ArrowDown) || kb.wasPressed(ex.Keys.S)) {
      this.section = "buttons";
      this.displayButtonIndex = 0;
      this.updateSelection();
      return;
    }
    if (
      kb.wasPressed(ex.Keys.Enter) ||
      kb.wasPressed(ex.Keys.Space) ||
      kb.wasPressed(ex.Keys.ArrowLeft) ||
      kb.wasPressed(ex.Keys.A) ||
      kb.wasPressed(ex.Keys.ArrowRight) ||
      kb.wasPressed(ex.Keys.D)
    ) {
      this.toggleFullscreen();
    }
  }

  private handleDisplayButtonInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.ArrowUp) || kb.wasPressed(ex.Keys.W)) {
      this.section = "content";
      this.displayContentRow = 0;
      this.updateSelection();
      return;
    }
    if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Space)) {
      void this.engine.goToScene(this.returnTo);
    }
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
    // Fullscreen transition is async; update label after it settles
    setTimeout(() => {
      this.updateFullscreenLabel();
      this.updateSelection();
    }, 100);
  }

  private updateFullscreenLabel(): void {
    const isFs = document.fullscreenElement != null;
    this.fullscreenValueLabel.text = isFs ? "[ On ]" : "[ Off ]";
  }

  // ── Keybinds tab ───────────────────────────────────────────────────

  private buildKeybindContent(): void {
    const labelX = this.centerX - 40;
    const slot1X = this.centerX + 40;
    const slot2X = this.centerX + 160;
    const startY = 95;
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
      this.keybindElements.push(categoryLabel);

      const slot1Label = new ex.Label({
        text: this.getSlotText(action, 1),
        pos: ex.vec(slot1X, y),
        font: FONT_KEY.clone(),
      });
      slot1Label.on("pointerdown", () => {
        this.section = "content";
        this.keybindContentRow = i;
        this.selectedSlot = 0;
        this.listening = true;
        this.listenKey = null;
        this.updateSelection();
      });
      this.add(slot1Label);
      this.keybindElements.push(slot1Label);

      const slot2Label = new ex.Label({
        text: this.getSlotText(action, 2),
        pos: ex.vec(slot2X, y),
        font: FONT_KEY.clone(),
      });
      slot2Label.on("pointerdown", () => {
        this.section = "content";
        this.keybindContentRow = i;
        this.selectedSlot = 1;
        this.listening = true;
        this.listenKey = null;
        this.updateSelection();
      });
      this.add(slot2Label);
      this.keybindElements.push(slot2Label);

      this.bindRowUIs.push({ slot1Label, slot2Label });
    }
  }

  private buildKeybindButtons(): void {
    const startY = 95 + ALL_ACTIONS.length * 30 + 30;
    const buttonSpacing = 36;

    for (let i = 0; i < KEYBIND_BUTTONS.length; i++) {
      const label = new ex.Label({
        text: KEYBIND_BUTTONS[i],
        pos: ex.vec(this.centerX, startY + i * buttonSpacing),
        font: FONT_BUTTON.clone(),
      });
      label.on("pointerdown", () => {
        this.section = "buttons";
        this.keybindButtonIndex = i;
        this.activateKeybindButton();
      });
      label.on("pointerenter", () => {
        this.section = "buttons";
        this.keybindButtonIndex = i;
        this.updateSelection();
      });
      this.add(label);
      this.keybindElements.push(label);
      this.keybindButtonLabels.push(label);
    }
  }

  private handleKeybindContentInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.ArrowUp) || kb.wasPressed(ex.Keys.W)) {
      if (this.keybindContentRow > 0) {
        this.keybindContentRow--;
        this.selectedSlot = 0;
      } else {
        this.section = "tabs";
      }
      this.updateSelection();
      return;
    }
    if (kb.wasPressed(ex.Keys.ArrowDown) || kb.wasPressed(ex.Keys.S)) {
      if (this.keybindContentRow < ALL_ACTIONS.length - 1) {
        this.keybindContentRow++;
        this.selectedSlot = 0;
      } else {
        this.section = "buttons";
        this.keybindButtonIndex = 0;
      }
      this.updateSelection();
      return;
    }

    // Left/right switches slots
    if (kb.wasPressed(ex.Keys.ArrowLeft) || kb.wasPressed(ex.Keys.A)) {
      this.selectedSlot = 0;
      this.updateSelection();
    }
    if (kb.wasPressed(ex.Keys.ArrowRight) || kb.wasPressed(ex.Keys.D)) {
      this.selectedSlot = 1;
      this.updateSelection();
    }

    // Enter/Space starts listening
    if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Space)) {
      this.listening = true;
      this.listenKey = null;
      this.updateSelection();
    }

    // Delete/Backspace clears a slot
    if (kb.wasPressed(ex.Keys.Delete) || kb.wasPressed(ex.Keys.Backspace)) {
      const action = ALL_ACTIONS[this.keybindContentRow];
      const slot = this.selectedSlot === 0 ? 1 : 2;
      setBinding(action, slot as 1 | 2, null);
      this.refreshAllSlots();
      this.updateSelection();
      void persistKeybinds();
    }
  }

  private handleKeybindButtonInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.ArrowUp) || kb.wasPressed(ex.Keys.W)) {
      if (this.keybindButtonIndex > 0) {
        this.keybindButtonIndex--;
      } else {
        this.section = "content";
        this.keybindContentRow = ALL_ACTIONS.length - 1;
        this.selectedSlot = 0;
      }
      this.updateSelection();
      return;
    }
    if (kb.wasPressed(ex.Keys.ArrowDown) || kb.wasPressed(ex.Keys.S)) {
      if (this.keybindButtonIndex < KEYBIND_BUTTONS.length - 1) {
        this.keybindButtonIndex++;
        this.updateSelection();
      }
      return;
    }
    if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Space)) {
      this.activateKeybindButton();
    }
  }

  private handleListening(kb: ex.Keyboard): void {
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
      const action = ALL_ACTIONS[this.keybindContentRow];
      const slot = this.selectedSlot === 0 ? 1 : 2;
      setBinding(action, slot as 1 | 2, this.listenKey);
      this.listening = false;
      this.listenKey = null;
      this.listenReady = false;
      this.refreshAllSlots();
      this.updateSelection();
      void persistKeybinds();
    }
  }

  private activateKeybindButton(): void {
    if (this.keybindButtonIndex === 0) {
      // Reset to Defaults
      resetBindings();
      this.refreshAllSlots();
      this.updateSelection();
      void persistKeybinds();
    } else if (this.keybindButtonIndex === 1) {
      // Back
      void this.engine.goToScene(this.returnTo);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

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

  // ── Selection rendering ────────────────────────────────────────────

  private updateSelection(): void {
    this.updateTabBar();

    if (this.activeTab === "Display") {
      this.updateDisplaySelection();
    } else {
      this.updateKeybindSelection();
    }
  }

  private updateTabBar(): void {
    for (let i = 0; i < this.tabLabels.length; i++) {
      const isActive = i === this.activeTabIndex;
      const isOnTabs = this.section === "tabs";

      if (isActive && isOnTabs) {
        this.tabLabels[i].font = FONT_TAB_SELECTED.clone();
        this.tabLabels[i].color = ex.Color.fromHex("#f0c040");
        this.tabLabels[i].text = `> ${TAB_NAMES[i]} <`;
      } else if (isActive) {
        this.tabLabels[i].font = FONT_TAB_ACTIVE.clone();
        this.tabLabels[i].color = ex.Color.White;
        this.tabLabels[i].text = `[ ${TAB_NAMES[i]} ]`;
      } else {
        this.tabLabels[i].font = FONT_TAB.clone();
        this.tabLabels[i].color = ex.Color.fromHex("#666666");
        this.tabLabels[i].text = TAB_NAMES[i];
      }
    }
  }

  private updateDisplaySelection(): void {
    // Fullscreen value highlight
    const fsSelected = this.section === "content" && this.displayContentRow === 0;
    this.fullscreenValueLabel.font = fsSelected ? FONT_KEY_SELECTED.clone() : FONT_KEY.clone();
    this.fullscreenValueLabel.color = fsSelected ? ex.Color.fromHex("#f0c040") : ex.Color.White;

    // Buttons
    for (let i = 0; i < this.displayButtonLabels.length; i++) {
      const selected = this.section === "buttons" && this.displayButtonIndex === i;
      const label = this.displayButtonLabels[i];
      label.font = selected ? FONT_BUTTON_SELECTED.clone() : FONT_BUTTON.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      label.text = selected ? `> ${DISPLAY_BUTTONS[i]} <` : DISPLAY_BUTTONS[i];
    }
  }

  private updateKeybindSelection(): void {
    // Bind row highlights
    for (let i = 0; i < this.bindRowUIs.length; i++) {
      const row = this.bindRowUIs[i];
      const isSelectedRow = this.section === "content" && i === this.keybindContentRow;

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

    // Buttons
    for (let i = 0; i < this.keybindButtonLabels.length; i++) {
      const selected = this.section === "buttons" && this.keybindButtonIndex === i;
      const label = this.keybindButtonLabels[i];
      label.font = selected ? FONT_BUTTON_SELECTED.clone() : FONT_BUTTON.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      label.text = selected ? `> ${KEYBIND_BUTTONS[i]} <` : KEYBIND_BUTTONS[i];
    }
  }
}
