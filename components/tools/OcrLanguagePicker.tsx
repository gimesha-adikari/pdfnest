"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import {
    AUTO_LANGUAGE_LABEL,
    languageLabel,
    languageSearchText,
    languageValue,
    orderedLanguageOptions,
    selectedLanguageCodes,
} from "@/lib/languagePresentation";
import type { OcrTextV2Language } from "@/lib/ocrV2";

interface OcrLanguagePickerProps {
    languages: OcrTextV2Language[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export default function OcrLanguagePicker({ languages, value, onChange, disabled = false }: OcrLanguagePickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const options = useMemo(() => orderedLanguageOptions(languages), [languages]);
    const filteredOptions = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        if (!normalizedQuery) return options;
        return options.filter((language) => languageSearchText(language).includes(normalizedQuery));
    }, [options, query]);
    const selected = selectedLanguageCodes(value);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        searchRef.current?.focus();
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    const selectAuto = () => {
        onChange("auto");
        setQuery("");
        setOpen(false);
    };

    const toggleLanguage = (code: string) => {
        const next = selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code];
        onChange(languageValue(next));
    };

    const selectedLabels = value === "auto"
        ? [AUTO_LANGUAGE_LABEL]
        : selected.map((code) => languageLabel(languages.find((language) => language.code === code) || { code, name: code }));

    return (
        <div ref={rootRef} className="relative mt-5" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
            <button
                type="button"
                role="combobox"
                aria-label="OCR language"
                aria-expanded={open}
                aria-controls="ocr-language-options"
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm text-[color:var(--foreground)] outline-none transition hover:border-indigo-400 focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
                <span className="flex min-w-0 flex-wrap gap-1.5">
                    {selectedLabels.length > 0 ? selectedLabels.map((label) => (
                        <span key={label} className="rounded-lg bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{label}</span>
                    )) : <span className="text-[color:var(--muted)]">Choose languages</span>}
                </span>
                <ChevronDown size={16} className="shrink-0 text-[color:var(--muted)]" />
            </button>

            {open && (
                <div id="ocr-language-options" className="absolute z-30 mt-2 w-full rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-3 shadow-2xl" role="listbox" aria-label="OCR languages" aria-multiselectable="true">
                    <div className="relative">
                        <Search size={15} className="pointer-events-none absolute left-3 top-3 text-[color:var(--muted)]" />
                        <input
                            ref={searchRef}
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
                            placeholder="Search languages..."
                            aria-label="Search languages"
                            className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--foreground)] outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div className="mt-3 max-h-72 overflow-y-auto" role="presentation">
                        <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Automatic</p>
                        <button type="button" role="option" aria-selected={value === "auto"} onClick={selectAuto} className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left text-sm font-semibold hover:bg-indigo-500/10">
                            <span>{AUTO_LANGUAGE_LABEL} <span className="ml-1 text-xs font-normal text-emerald-600">Recommended</span></span>
                            {value === "auto" && <Check size={15} className="text-indigo-500" />}
                        </button>
                        <p className="mt-3 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Languages</p>
                        {filteredOptions.length > 0 ? filteredOptions.map((language) => {
                            const isSelected = selected.includes(language.code);
                            return <button key={language.code} type="button" role="option" aria-selected={isSelected} onClick={() => toggleLanguage(language.code)} className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left text-sm hover:bg-indigo-500/10"><span>{languageLabel(language)}</span>{isSelected && <Check size={15} className="text-indigo-500" />}</button>;
                        }) : <p className="px-2 py-3 text-xs text-[color:var(--muted)]">No matching languages.</p>}
                    </div>
                    {selected.length > 0 && value !== "auto" && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[color:var(--border)] pt-3">{selected.map((code) => { const label = languageLabel(languages.find((language) => language.code === code) || { code, name: code }); return <button key={code} type="button" onClick={() => toggleLanguage(code)} className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--muted)] hover:border-indigo-400" aria-label={`Remove ${label}`}><span>{label}</span><X size={12} /></button>; })}</div>}
                </div>
            )}
        </div>
    );
}
