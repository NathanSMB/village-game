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
import {
  type LLMProviderConfig,
  PROVIDER_ORDER,
  PROVIDER_LABELS,
  REASONING_EFFORT_ORDER,
  PROVIDER_SORT_ORDER,
  callLLM,
} from "../systems/llm-provider.ts";
import { loadLLMConfig, saveLLMConfig, getProviderDefaults } from "../systems/llm-settings.ts";

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

const TAB_NAMES = ["Display", "Keybinds", "AI"] as const;
type TabName = (typeof TAB_NAMES)[number];

const DISPLAY_BUTTONS = ["Back"];
const KEYBIND_BUTTONS = ["Reset to Defaults", "Back"];
const AI_BUTTONS = ["Test Connection", "Clear", "Back"];

const AI_FIELD_LABELS = [
  "Provider:",
  "API Key:",
  "Model:",
  "Endpoint:",
  "Reasoning:",
  "Sort:",
] as const;

const FONT_VALUE = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_VALUE_SELECTED = new ex.Font({
  family: "monospace",
  size: 16,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Left,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_STATUS = new ex.Font({
  family: "monospace",
  size: 14,
  color: ex.Color.fromHex("#88ff88"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

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

  // AI tab
  private aiElements: ex.Label[] = [];
  private aiButtonLabels: ex.Label[] = [];
  private aiValueLabels: ex.Label[] = [];
  private aiContentRow = 0;
  private aiButtonIndex = 0;
  private aiConfig: LLMProviderConfig = {
    provider: "custom",
    apiKey: "",
    model: "",
    endpointUrl: "",
    reasoningEffort: "low",
    providerSort: "latency",
  };
  private aiTyping = false;
  private aiTypingField: number = -1; // 1=apiKey, 2=model, 3=endpoint
  private aiTypingBuffer = "";
  private aiStatusLabel!: ex.Label;
  private aiRowLabels: ex.Label[] = []; // the left-side "Provider:", "API Key:", etc. labels
  private pasteHandler: ((e: ClipboardEvent) => void) | null = null;

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
    this.buildAIContent();
    this.buildAIButtons();
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
    this.aiContentRow = 0;
    this.aiButtonIndex = 0;
    this.aiTyping = false;
    this.aiTypingField = -1;

    // Ensure AI tab exists (handles HMR where onInitialize already ran with old code)
    this.ensureAITab();

    this.refreshAllSlots();
    this.updateFullscreenLabel();
    void this.loadAIConfig();
    this.switchTab(0);
    this.updateSelection();
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    // AI typing mode — input handled by native keydown/paste listeners
    if (this.aiTyping) return;

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
      } else if (this.activeTab === "Keybinds") {
        this.handleKeybindContentInput(kb);
      } else {
        this.handleAIContentInput(kb);
      }
    } else {
      if (this.activeTab === "Display") {
        this.handleDisplayButtonInput(kb);
      } else if (this.activeTab === "Keybinds") {
        this.handleKeybindButtonInput(kb);
      } else {
        this.handleAIButtonInput(kb);
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

    const showAI = this.activeTab === "AI";
    for (const el of this.aiElements) el.graphics.visible = showAI;

    if (showDisplay) this.updateFullscreenLabel();

    // Reset content selection when switching
    this.displayContentRow = 0;
    this.displayButtonIndex = 0;
    this.keybindContentRow = 0;
    this.keybindButtonIndex = 0;
    this.selectedSlot = 0;
    this.aiContentRow = 0;
    this.aiButtonIndex = 0;

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
    } else if (this.activeTab === "Keybinds") {
      this.updateKeybindSelection();
    } else {
      this.updateAISelection();
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

  // ── AI tab ────────────────────────────────────────────────────────

  /**
   * Ensure the AI tab and its 3rd tab label exist.
   * Handles HMR where onInitialize already ran with old 2-tab code.
   */
  private ensureAITab(): void {
    // Add the 3rd tab label if the tab bar only has 2 entries
    if (this.tabLabels.length < TAB_NAMES.length) {
      const spacing = 100;
      const startX = this.centerX - ((TAB_NAMES.length - 1) * spacing) / 2;

      // Reposition existing tabs for new spacing
      for (let i = 0; i < this.tabLabels.length; i++) {
        this.tabLabels[i].pos = ex.vec(startX + i * spacing, 65);
      }

      // Add missing tabs
      for (let i = this.tabLabels.length; i < TAB_NAMES.length; i++) {
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

    // Build AI content if not already built
    if (this.aiElements.length === 0) {
      this.buildAIContent();
      this.buildAIButtons();
    }
  }

  private async loadAIConfig(): Promise<void> {
    this.aiConfig = await loadLLMConfig();
    this.refreshAIValues();
  }

  private buildAIContent(): void {
    const labelX = this.centerX - 40;
    const valueX = this.centerX + 10;
    const startY = 120;
    const rowSpacing = 36;

    for (let i = 0; i < AI_FIELD_LABELS.length; i++) {
      const y = startY + i * rowSpacing;

      const label = new ex.Label({
        text: AI_FIELD_LABELS[i],
        pos: ex.vec(labelX, y),
        font: FONT_LABEL,
      });
      this.add(label);
      this.aiElements.push(label);
      this.aiRowLabels.push(label);

      const valueLabel = new ex.Label({
        text: "",
        pos: ex.vec(valueX, y),
        font: FONT_VALUE.clone(),
      });
      valueLabel.on("pointerdown", () => {
        this.section = "content";
        this.aiContentRow = i;
        if (i === 0) {
          this.cycleProvider(1);
        } else if (i === 4 || i === 5) {
          // cycle selectors
          if (i === 4) this.cycleReasoning(1);
          else this.cycleSort(1);
        } else {
          this.startAITyping(i);
        }
        this.updateSelection();
      });
      this.add(valueLabel);
      this.aiElements.push(valueLabel);
      this.aiValueLabels.push(valueLabel);
    }

    // Status label for test results
    this.aiStatusLabel = new ex.Label({
      text: "",
      pos: ex.vec(this.centerX, startY + AI_FIELD_LABELS.length * rowSpacing + 10),
      font: FONT_STATUS.clone(),
    });
    this.add(this.aiStatusLabel);
    this.aiElements.push(this.aiStatusLabel);
  }

  private buildAIButtons(): void {
    const startY = 120 + AI_FIELD_LABELS.length * 36 + 40;
    const buttonSpacing = 36;

    for (let i = 0; i < AI_BUTTONS.length; i++) {
      const label = new ex.Label({
        text: AI_BUTTONS[i],
        pos: ex.vec(this.centerX, startY + i * buttonSpacing),
        font: FONT_BUTTON.clone(),
      });
      label.on("pointerdown", () => {
        this.section = "buttons";
        this.aiButtonIndex = i;
        this.activateAIButton();
      });
      label.on("pointerenter", () => {
        this.section = "buttons";
        this.aiButtonIndex = i;
        this.updateSelection();
      });
      this.add(label);
      this.aiElements.push(label);
      this.aiButtonLabels.push(label);
    }
  }

  private refreshAIValues(): void {
    if (this.aiValueLabels.length < 6) return;
    this.aiValueLabels[0].text = `< ${PROVIDER_LABELS[this.aiConfig.provider]} >`;
    this.aiValueLabels[1].text = this.aiConfig.apiKey
      ? `${"*".repeat(Math.min(this.aiConfig.apiKey.length, 20))}`
      : "(not set)";
    this.aiValueLabels[2].text = this.aiConfig.model || "(not set)";
    this.aiValueLabels[3].text = this.aiConfig.endpointUrl || "(not set)";
    this.aiValueLabels[4].text = `< ${this.aiConfig.reasoningEffort ?? "low"} >`;
    this.aiValueLabels[5].text = `< ${this.aiConfig.providerSort ?? "latency"} >`;

    // Reasoning + Sort rows are OpenRouter-only
    const showExtra = this.aiConfig.provider === "custom";
    for (const idx of [4, 5]) {
      if (this.aiValueLabels[idx]) this.aiValueLabels[idx].graphics.visible = showExtra;
      if (this.aiRowLabels[idx]) this.aiRowLabels[idx].graphics.visible = showExtra;
    }
  }

  /** The last navigable content row (3 for non-OpenRouter, 5 for OpenRouter). */
  private get aiMaxContentRow(): number {
    return this.aiConfig.provider === "custom" ? AI_FIELD_LABELS.length - 1 : 3;
  }

  private handleAIContentInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.ArrowUp) || kb.wasPressed(ex.Keys.W)) {
      if (this.aiContentRow > 0) {
        this.aiContentRow--;
      } else {
        this.section = "tabs";
      }
      this.updateSelection();
      return;
    }
    if (kb.wasPressed(ex.Keys.ArrowDown) || kb.wasPressed(ex.Keys.S)) {
      if (this.aiContentRow < this.aiMaxContentRow) {
        this.aiContentRow++;
      } else {
        this.section = "buttons";
        this.aiButtonIndex = 0;
      }
      this.updateSelection();
      return;
    }

    if (this.aiContentRow === 0) {
      // Provider row — cycle with left/right/enter
      if (kb.wasPressed(ex.Keys.ArrowLeft) || kb.wasPressed(ex.Keys.A)) {
        this.cycleProvider(-1);
      }
      if (
        kb.wasPressed(ex.Keys.ArrowRight) ||
        kb.wasPressed(ex.Keys.D) ||
        kb.wasPressed(ex.Keys.Enter) ||
        kb.wasPressed(ex.Keys.Space)
      ) {
        this.cycleProvider(1);
      }
    } else if (this.aiContentRow === 4 || this.aiContentRow === 5) {
      // Cycle selectors: row 4 = reasoning, row 5 = sort
      const cycleFn =
        this.aiContentRow === 4
          ? (d: number) => this.cycleReasoning(d)
          : (d: number) => this.cycleSort(d);
      if (kb.wasPressed(ex.Keys.ArrowLeft) || kb.wasPressed(ex.Keys.A)) {
        cycleFn(-1);
      }
      if (
        kb.wasPressed(ex.Keys.ArrowRight) ||
        kb.wasPressed(ex.Keys.D) ||
        kb.wasPressed(ex.Keys.Enter) ||
        kb.wasPressed(ex.Keys.Space)
      ) {
        cycleFn(1);
      }
    } else {
      // Text input fields — enter to type
      if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Space)) {
        this.startAITyping(this.aiContentRow);
      }
    }
  }

  private handleAIButtonInput(kb: ex.Keyboard): void {
    if (kb.wasPressed(ex.Keys.ArrowUp) || kb.wasPressed(ex.Keys.W)) {
      if (this.aiButtonIndex > 0) {
        this.aiButtonIndex--;
      } else {
        this.section = "content";
        this.aiContentRow = this.aiMaxContentRow;
      }
      this.updateSelection();
      return;
    }
    if (kb.wasPressed(ex.Keys.ArrowDown) || kb.wasPressed(ex.Keys.S)) {
      if (this.aiButtonIndex < AI_BUTTONS.length - 1) {
        this.aiButtonIndex++;
        this.updateSelection();
      }
      return;
    }
    if (kb.wasPressed(ex.Keys.Enter) || kb.wasPressed(ex.Keys.Space)) {
      this.activateAIButton();
    }
  }

  private cycleProvider(dir: number): void {
    const idx = PROVIDER_ORDER.indexOf(this.aiConfig.provider);
    const next = PROVIDER_ORDER[(idx + dir + PROVIDER_ORDER.length) % PROVIDER_ORDER.length];
    this.aiConfig.provider = next;
    const defaults = getProviderDefaults(next);
    this.aiConfig.endpointUrl = defaults.endpointUrl;
    this.aiConfig.model = defaults.model;
    this.refreshAIValues();
    this.updateSelection();
    void saveLLMConfig(this.aiConfig);
  }

  private cycleReasoning(dir: number): void {
    const idx = REASONING_EFFORT_ORDER.indexOf(this.aiConfig.reasoningEffort ?? "low");
    const next =
      REASONING_EFFORT_ORDER[
        (idx + dir + REASONING_EFFORT_ORDER.length) % REASONING_EFFORT_ORDER.length
      ];
    this.aiConfig.reasoningEffort = next;
    this.refreshAIValues();
    this.updateSelection();
    void saveLLMConfig(this.aiConfig);
  }

  private cycleSort(dir: number): void {
    const idx = PROVIDER_SORT_ORDER.indexOf(this.aiConfig.providerSort ?? "latency");
    const next =
      PROVIDER_SORT_ORDER[(idx + dir + PROVIDER_SORT_ORDER.length) % PROVIDER_SORT_ORDER.length];
    this.aiConfig.providerSort = next;
    this.refreshAIValues();
    this.updateSelection();
    void saveLLMConfig(this.aiConfig);
  }

  private startAITyping(row: number): void {
    this.aiTyping = true;
    this.aiTypingField = row;
    // Pre-fill buffer with current value
    if (row === 1) this.aiTypingBuffer = this.aiConfig.apiKey;
    else if (row === 2) this.aiTypingBuffer = this.aiConfig.model;
    else if (row === 3) this.aiTypingBuffer = this.aiConfig.endpointUrl;
    this.updateAITypingDisplay();

    // Use native keydown + paste for all text input (Excalibur keys are enums, not chars)
    this.removeNativeListeners();
    this.keydownHandler = (e: KeyboardEvent) => {
      // Let Ctrl/Cmd combos through so paste events fire naturally
      if (e.ctrlKey || e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        this.stopAITyping();
        this.refreshAIValues();
        this.updateSelection();
        return;
      }

      if (e.key === "Enter") {
        if (this.aiTypingField === 1) this.aiConfig.apiKey = this.aiTypingBuffer;
        else if (this.aiTypingField === 2) this.aiConfig.model = this.aiTypingBuffer;
        else if (this.aiTypingField === 3) this.aiConfig.endpointUrl = this.aiTypingBuffer;
        this.stopAITyping();
        this.refreshAIValues();
        this.updateSelection();
        void saveLLMConfig(this.aiConfig);
        return;
      }

      if (e.key === "Backspace") {
        this.aiTypingBuffer = this.aiTypingBuffer.slice(0, -1);
        this.updateAITypingDisplay();
        return;
      }

      // Ignore modifier-only keys and control combos (paste handled by paste listener)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return; // Skip non-printable keys (Shift, Tab, etc.)

      this.aiTypingBuffer += e.key;
      this.updateAITypingDisplay();
    };

    this.pasteHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text");
      if (text) {
        this.aiTypingBuffer += text.trim();
        this.updateAITypingDisplay();
      }
    };

    document.addEventListener("keydown", this.keydownHandler, true);
    document.addEventListener("paste", this.pasteHandler);
  }

  private stopAITyping(): void {
    this.aiTyping = false;
    this.aiTypingField = -1;
    this.removeNativeListeners();
  }

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  private removeNativeListeners(): void {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler, true);
      this.keydownHandler = null;
    }
    if (this.pasteHandler) {
      document.removeEventListener("paste", this.pasteHandler);
      this.pasteHandler = null;
    }
  }

  private updateAITypingDisplay(): void {
    if (this.aiTypingField < 1 || this.aiTypingField > 3) return;
    const label = this.aiValueLabels[this.aiTypingField];
    if (this.aiTypingField === 1) {
      // API key — show masked
      label.text =
        this.aiTypingBuffer.length > 0 ? "*".repeat(this.aiTypingBuffer.length) + "_" : "_";
    } else {
      label.text = this.aiTypingBuffer + "_";
    }
    label.font = FONT_KEY_LISTENING.clone();
    label.font.textAlign = ex.TextAlign.Left;
    label.color = ex.Color.fromHex("#ff6060");
  }

  private activateAIButton(): void {
    if (this.aiButtonIndex === 0) {
      // Test Connection
      this.testAIConnection();
    } else if (this.aiButtonIndex === 1) {
      // Clear
      this.aiConfig.apiKey = "";
      this.aiConfig.model = "";
      this.aiConfig.endpointUrl = "";
      this.refreshAIValues();
      this.updateSelection();
      void saveLLMConfig(this.aiConfig);
      this.aiStatusLabel.text = "Cleared";
      this.aiStatusLabel.color = ex.Color.fromHex("#cccccc");
    } else if (this.aiButtonIndex === 2) {
      // Back
      void this.engine.goToScene(this.returnTo);
    }
  }

  private testAIConnection(): void {
    this.aiStatusLabel.text = "Testing...";
    this.aiStatusLabel.color = ex.Color.fromHex("#cccccc");

    callLLM(this.aiConfig, [
      { role: "system", content: "Respond with exactly: OK" },
      { role: "user", content: "Test" },
    ])
      .then((resp) => {
        if (resp.error) {
          this.aiStatusLabel.text = `Error: ${resp.error.slice(0, 50)}`;
          this.aiStatusLabel.color = ex.Color.fromHex("#ff6060");
        } else {
          this.aiStatusLabel.text = `Connected! Response: "${resp.text.slice(0, 30)}"`;
          this.aiStatusLabel.color = ex.Color.fromHex("#88ff88");
        }
      })
      .catch(() => {
        this.aiStatusLabel.text = "Connection failed";
        this.aiStatusLabel.color = ex.Color.fromHex("#ff6060");
      });
  }

  private updateAISelection(): void {
    // Value highlights
    for (let i = 0; i < this.aiValueLabels.length; i++) {
      const selected = this.section === "content" && this.aiContentRow === i;
      const label = this.aiValueLabels[i];
      if (this.aiTyping && this.aiTypingField === i) continue; // don't override typing style
      label.font = selected ? FONT_VALUE_SELECTED.clone() : FONT_VALUE.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
    }

    // Buttons
    for (let i = 0; i < this.aiButtonLabels.length; i++) {
      const selected = this.section === "buttons" && this.aiButtonIndex === i;
      const label = this.aiButtonLabels[i];
      label.font = selected ? FONT_BUTTON_SELECTED.clone() : FONT_BUTTON.clone();
      label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
      label.text = selected ? `> ${AI_BUTTONS[i]} <` : AI_BUTTONS[i];
    }
  }
}
