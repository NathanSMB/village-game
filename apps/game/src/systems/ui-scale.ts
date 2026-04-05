import type * as ex from "excalibur";

/**
 * Reference viewport height for UI layout.
 *
 * All hardcoded pixel values (font sizes, positions, spacing) in menu
 * scenes were authored against this logical height. The camera zoom is
 * set to `drawHeight / UI_REF_HEIGHT` so the same coordinates produce
 * correctly-sized visuals on any physical resolution.
 */
export const UI_REF_HEIGHT = 600;

/**
 * Return the UI scale factor for the current viewport.
 *
 * Menu scenes apply this as camera zoom; in-game ScreenElements (HUD,
 * overlay panels) multiply their Canvas dimensions and use
 * `ctx.scale()` so content renders at the correct physical size.
 */
export function getUIScale(engine: ex.Engine): number {
  return engine.drawHeight / UI_REF_HEIGHT;
}
