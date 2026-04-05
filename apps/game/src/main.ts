import * as ex from "excalibur";
import { StartScreen } from "./scenes/start-screen.ts";
import { Settings } from "./scenes/settings.ts";
import { CharacterCreator } from "./scenes/character-creator.ts";
import { GameWorld } from "./scenes/game-world.ts";
import { PauseMenu } from "./scenes/pause-menu.ts";
import { SaveGame } from "./scenes/save-game.ts";
import { LoadGame } from "./scenes/load-game.ts";
import { GameOver } from "./scenes/game-over.ts";
import { initDB } from "./systems/save-manager.ts";
import { loadKeybinds } from "./systems/keybinds.ts";
import { getAllImageSources } from "./systems/sprite-loader.ts";

await initDB();
await loadKeybinds();

const engine = new ex.Engine({
  canvasElementId: "game",
  displayMode: ex.DisplayMode.FillScreen,
  pixelArt: true,
  antialiasing: false,
  snapToPixel: true,
  backgroundColor: ex.Color.fromHex("#1a1a2e"),
  suppressConsoleBootMessage: true,
  fixedUpdateFps: 60,
});

engine.addScene("start", new StartScreen());
engine.addScene("settings", new Settings());
engine.addScene("character-creator", new CharacterCreator());
engine.addScene("game-world", new GameWorld());
engine.addScene("pause-menu", new PauseMenu());
engine.addScene("save-game", new SaveGame());
engine.addScene("load-game", new LoadGame());
engine.addScene("game-over", new GameOver());

const loader = new ex.Loader(getAllImageSources());
loader.suppressPlayButton = true;
await engine.start(loader);
void engine.goToScene("start");
