/**
 * i18n is wired up from day one (see docs/ADR/0006-i18n-from-day-one.md).
 *
 * NOTE (decision): no user-facing string is ever hardcoded in a component —
 * every string lives in a locale file and is read via `t("key")`. Retrofitting
 * i18n later is expensive, so we pay the small cost now. Adding a language is
 * just another JSON file under ./locales.
 *
 * Money and dates are formatted with Intl (locale-aware) in lib/money.ts and
 * lib/date.ts, so they complement these translations rather than duplicating them.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import zhTW from "./locales/zh-TW.json";

export const resources = {
  en: { translation: en },
  "zh-TW": { translation: zhTW },
} as const;

export const supportedLngs = ["en", "zh-TW"] as const;

i18n.use(initReactI18next);
// Browser-only: language detection touches window/navigator, absent under tests.
if (typeof window !== "undefined") {
  i18n.use(LanguageDetector);
}

i18n.init({
  resources,
  fallbackLng: "en",
  supportedLngs: [...supportedLngs],
  interpolation: { escapeValue: false }, // React already escapes output
});

export default i18n;
