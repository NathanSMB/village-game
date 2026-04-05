import * as ex from "excalibur";
import { wasActionPressed } from "../systems/keybinds.ts";
import { UI_REF_HEIGHT } from "../systems/ui-scale.ts";

const FONT_TITLE = new ex.Font({
  family: "monospace",
  size: 48,
  bold: true,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_MENU = new ex.Font({
  family: "monospace",
  size: 24,
  color: ex.Color.White,
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_MENU_SELECTED = new ex.Font({
  family: "monospace",
  size: 24,
  bold: true,
  color: ex.Color.fromHex("#f0c040"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

interface MenuItem {
  label: string;
  action: (engine: ex.Engine) => void;
}

export class StartScreen extends ex.Scene {
  private menuItems: MenuItem[] = [];
  private menuLabels: ex.Label[] = [];
  private selectedIndex = 0;

  override onInitialize(engine: ex.Engine): void {
    const centerX = engine.drawWidth / 2;

    const title = new ex.Label({
      text: "Village Game",
      pos: ex.vec(centerX, 120),
      font: FONT_TITLE,
    });
    this.add(title);

    this.menuItems = [
      {
        label: "New Game",
        action: (e) => {
          void e.goToScene("character-creator");
        },
      },
      {
        label: "Load Game",
        action: (e) => {
          void e.goToScene("load-game", { sceneActivationData: { returnTo: "start" } });
        },
      },
      {
        label: "Settings",
        action: (e) => {
          void e.goToScene("settings", { sceneActivationData: { returnTo: "start" } });
        },
      },
    ];

    const menuStartY = 260;
    const menuSpacing = 50;

    for (let i = 0; i < this.menuItems.length; i++) {
      const item = this.menuItems[i];
      const label = new ex.Label({
        text: item.label,
        pos: ex.vec(centerX, menuStartY + i * menuSpacing),
        font: i === 0 ? FONT_MENU_SELECTED.clone() : FONT_MENU.clone(),
      });

      label.on("pointerenter", () => {
        this.selectItem(i);
      });

      label.on("pointerdown", () => {
        this.activateItem(engine);
      });

      this.menuLabels.push(label);
      this.add(label);
    }
  }

  override onActivate(): void {
    const vw = this.engine.drawWidth * this.camera.zoom;
    const vh = this.engine.drawHeight * this.camera.zoom;
    this.camera.zoom = vh / UI_REF_HEIGHT;
    this.camera.pos = ex.vec(vw / 2, UI_REF_HEIGHT / 2);
    this.selectedIndex = 0;
    this.updateSelection();
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    if (wasActionPressed(kb, "moveUp")) {
      this.selectItem((this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length);
    }

    if (wasActionPressed(kb, "moveDown")) {
      this.selectItem((this.selectedIndex + 1) % this.menuItems.length);
    }

    if (wasActionPressed(kb, "confirm")) {
      this.activateItem(engine);
    }
  }

  private selectItem(index: number): void {
    this.selectedIndex = index;
    this.updateSelection();
  }

  private updateSelection(): void {
    for (let i = 0; i < this.menuLabels.length; i++) {
      const label = this.menuLabels[i];
      if (i === this.selectedIndex) {
        label.font = FONT_MENU_SELECTED.clone();
        label.color = ex.Color.fromHex("#f0c040");
        label.text = `> ${this.menuItems[i].label} <`;
      } else {
        label.font = FONT_MENU.clone();
        label.color = ex.Color.White;
        label.text = this.menuItems[i].label;
      }
    }
  }

  private activateItem(engine: ex.Engine): void {
    const item = this.menuItems[this.selectedIndex];
    item.action(engine);
  }
}
