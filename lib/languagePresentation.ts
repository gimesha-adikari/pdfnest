import type { OcrTextV2Language } from "@/lib/ocrV2";

const KNOWN_LANGUAGE_LABELS: Record<string, string> = {
    eng: "English",
    sin: "Sinhala",
    tam: "Tamil",
    jpn: "Japanese",
    jpn_vert: "Japanese — Vertical text",
};

const SUGGESTED_LANGUAGE_CODES = ["eng", "sin", "tam"];

function humanizeCode(code: string): string {
    const words = code
        .replace(/[_-]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
    return words.join(" ") || "Unknown language";
}

export function languageLabel(language: OcrTextV2Language): string {
    const code = language.code.trim().toLowerCase();
    const backendName = language.name.trim();
    return KNOWN_LANGUAGE_LABELS[code] || (backendName && backendName.toLowerCase() !== code ? backendName : humanizeCode(code));
}

export function languageSearchText(language: OcrTextV2Language): string {
    return `${languageLabel(language)} ${language.name} ${language.code}`.toLocaleLowerCase();
}

export function orderedLanguageOptions(languages: OcrTextV2Language[]): OcrTextV2Language[] {
    const suggested = new Set(SUGGESTED_LANGUAGE_CODES);
    return [...languages].sort((left, right) => {
        const leftSuggested = suggested.has(left.code.toLowerCase()) ? 0 : 1;
        const rightSuggested = suggested.has(right.code.toLowerCase()) ? 0 : 1;
        if (leftSuggested !== rightSuggested) return leftSuggested - rightSuggested;
        return languageLabel(left).localeCompare(languageLabel(right));
    });
}

export function selectedLanguageCodes(value: string): string[] {
    if (!value || value === "auto") return [];
    return value.split("+").filter(Boolean);
}

export function languageValue(codes: string[]): string {
    return [...new Set(codes)].sort().join("+");
}

export const AUTO_LANGUAGE_LABEL = "Detect automatically";
