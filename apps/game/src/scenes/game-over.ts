import * as ex from "excalibur";
import { wasActionPressed } from "../systems/keybinds.ts";
import { UI_REF_HEIGHT } from "../systems/ui-scale.ts";

const FONT_TITLE = new ex.Font({
  family: "monospace",
  size: 48,
  bold: true,
  color: ex.Color.fromHex("#cc3333"),
  textAlign: ex.TextAlign.Center,
  baseAlign: ex.BaseAlign.Middle,
});

const FONT_CAUSE = new ex.Font({
  family: "monospace",
  size: 20,
  color: ex.Color.fromHex("#aaaaaa"),
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

export type DeathCause = "starvation" | "dehydration" | "both";

export interface GameOverData {
  cause: DeathCause;
}

const CAUSE_MESSAGE: Record<DeathCause, string> = {
  starvation: "You starved to death.",
  dehydration: "You died of thirst.",
  both: "You died of hunger and thirst.",
};

interface MenuItem {
  label: string;
  action: (engine: ex.Engine) => void;
}

export class GameOver extends ex.Scene<GameOverData> {
  private menuItems: MenuItem[] = [];
  private menuLabels: ex.Label[] = [];
  private causeLabel: ex.Label | null = null;
  private selectedIndex = 0;

  override onInitialize(engine: ex.Engine): void {
    const centerX = engine.drawWidth / 2;

    const title = new ex.Label({
      text: "You Died",
      pos: ex.vec(centerX, 120),
      font: FONT_TITLE,
    });
    this.add(title);

    this.causeLabel = new ex.Label({
      text: "",
      pos: ex.vec(centerX, 180),
      font: FONT_CAUSE,
    });
    this.add(this.causeLabel);

    this.menuItems = [
      {
        label: "Load Game",
        action: (e) => {
          void e.goToScene("load-game", { sceneActivationData: { returnTo: "start" } });
        },
      },
      {
        label: "Main Menu",
        action: (e) => {
          void e.goToScene("start");
        },
      },
    ];

    const menuStartY = 280;
    const menuSpacing = 50;

    for (let i = 0; i < this.menuItems.length; i++) {
      const label = new ex.Label({
        text: this.menuItems[i].label,
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

  override onActivate(context: ex.SceneActivationContext<GameOverData>): void {
    const vw = this.engine.drawWidth * this.camera.zoom;
    const vh = this.engine.drawHeight * this.camera.zoom;
    this.camera.zoom = vh / UI_REF_HEIGHT;
    this.camera.pos = ex.vec(vw / 2, UI_REF_HEIGHT / 2);
    this.selectedIndex = 0;
    this.updateSelection();

    if (context.data && this.causeLabel) {
      this.causeLabel.text = CAUSE_MESSAGE[context.data.cause];
    }
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
