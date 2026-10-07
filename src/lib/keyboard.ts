import type { KeyboardEvent } from "react";

/**
 * True while an IME (注音, 拼音, kana…) owns the keystroke — the Enter that
 * picks a candidate, the Escape that cancels one. Acting on it as well inserts
 * the text twice (blurring mid-composition commits it, then the IME commits it
 * again) or submits a half-typed word.
 *
 * `isComposing` covers Chrome/Firefox; Safari fires the confirming keydown
 * after `compositionend` with `isComposing` already false, but still reports
 * the legacy keyCode 229.
 */
export function isImeKey(e: KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}
