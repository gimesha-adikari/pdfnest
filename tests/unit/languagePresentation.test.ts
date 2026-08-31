import assert from "assert";

import {
    AUTO_LANGUAGE_LABEL,
    languageLabel,
    languageSearchText,
    orderedLanguageOptions,
    selectedLanguageCodes,
    languageValue,
} from "@/lib/languagePresentation";

const languages = [
    { code: "jpn_vert", name: "jpn_vert" },
    { code: "tam", name: "Tamil (tam)" },
    { code: "eng", name: "English" },
    { code: "sin", name: "Sinhala" },
];

assert.strictEqual(AUTO_LANGUAGE_LABEL, "Detect automatically");
assert.strictEqual(languageLabel(languages[0]), "Japanese — Vertical text");
assert.strictEqual(languageLabel({ code: "custom_pack", name: "Custom language" }), "Custom language");
assert.ok(languageSearchText({ code: "sin", name: "Sinhalese" }).includes("sinhala"));
assert.ok(languageSearchText({ code: "sin", name: "Sinhalese" }).includes("sin"));
assert.deepStrictEqual(orderedLanguageOptions(languages).map((item) => item.code), ["eng", "sin", "tam", "jpn_vert"]);
assert.deepStrictEqual(selectedLanguageCodes("eng+sin"), ["eng", "sin"]);
assert.deepStrictEqual(selectedLanguageCodes("auto"), []);
assert.strictEqual(languageValue(["sin", "eng", "sin"]), "eng+sin");

console.log("Language presentation tests passed.");
