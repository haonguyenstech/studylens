// Strings the app shows to the user (log lines, errors, dialogs), in the UI language. The texts live in
// src/shared/strings.json, which the Rust side reads too. Text written for Claude (GUIDE.md, prompts)
// stays as is: it is never shown in the UI.
import strings from "../shared/strings.json";

export type Lang = "vi" | "en";
export type Key = keyof typeof strings.vi;
const dict: Record<Lang, Record<Key, string>> = strings;
let current: Lang = "vi";

export function setLang(l: Lang) { current = l === "en" ? "en" : "vi"; }
export function getLang(): Lang { return current; }
export const numberLocale = () => (current === "en" ? "en-US" : "vi-VN");

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return dict[current][key].replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
