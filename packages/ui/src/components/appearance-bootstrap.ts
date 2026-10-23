export type Appearance = "light" | "dark" | "system";

export const isAppearance = (value: unknown): value is Appearance =>
  value === "light" || value === "dark" || value === "system";

/** Literal browser source does not capture Workers' injected keepNames helpers. */
export function createAppearanceBootstrap(initialTheme: Appearance): string {
  return `(()=>{var t=${JSON.stringify(initialTheme)};if(t==="system"){try{t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="dark"}}var d=document.documentElement;d.classList.remove("light","dark");d.classList.add(t);d.style.colorScheme=t})()`;
}
