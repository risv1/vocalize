import type { ThemePreference } from "./types";

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/** --accent-active and --accent-glow are derived from --accent via
 * color-mix() in tokens.css, so setting this one variable re-themes
 * buttons, the orb, and the blob glow together. */
export function applyAccentColor(hex: string): void {
  document.documentElement.style.setProperty("--accent", hex);
}
