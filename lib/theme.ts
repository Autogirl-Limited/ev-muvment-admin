export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ev-theme";
/** Fired on `window` after the preference changes in this tab. */
export const THEME_CHANGE_EVENT = "ev-theme-change";

/**
 * Runs synchronously while the HTML is parsed, before first paint, so the page
 * never flashes the wrong theme. Keep it dependency-free and defensive:
 * storage can throw (private mode, blocked cookies).
 */
export const themeInitScript = `(function(){var p=null;try{p=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"})()`;
