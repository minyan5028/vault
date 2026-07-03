/**
 * Type-safe translation keys: `t("...")` autocompletes and errors on unknown
 * keys, using the English resource as the source of truth for key names.
 */
import "i18next";
import type en from "./locales/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
