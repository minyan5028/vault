import { describe, it, expect, beforeAll } from "vitest";
import i18n, { supportedLngs } from "./index";

describe("i18n", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("resolves English strings", () => {
    expect(i18n.t("appName")).toBe("Vault");
    expect(i18n.t("tagline")).toBe("Your personal finance OS.");
  });

  it("switches language and resolves zh-TW", async () => {
    await i18n.changeLanguage("zh-TW");
    expect(i18n.t("tagline")).toBe("你的個人財務作業系統。");
    await i18n.changeLanguage("en");
  });

  it("interpolates variables", () => {
    expect(i18n.t("scaffoldNote", { example: "NT$149.90" })).toContain("NT$149.90");
  });

  it("has matching keys across all locales (no missing translations)", () => {
    const enKeys = Object.keys(i18n.getDataByLanguage("en")!.translation).sort();
    for (const lng of supportedLngs) {
      const keys = Object.keys(i18n.getDataByLanguage(lng)!.translation).sort();
      expect(keys, `locale ${lng} keys should match en`).toEqual(enKeys);
    }
  });
});
