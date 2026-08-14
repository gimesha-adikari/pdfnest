"use client";

import type { MarkupToolConfig } from "@/lib/markup/config";
import type { MarkupMode } from "@/lib/markup/types";

interface MarkupModeFieldsProps {
    config: MarkupToolConfig;
    mode: MarkupMode;
    onModeChange: (mode: MarkupMode) => void;
    canUseSmartMode: boolean;
    selectedColor: string;
    onColorChange: (hex: string) => void;
    className?: string;
}

export default function MarkupModeFields({
    config,
    mode,
    onModeChange,
    canUseSmartMode,
    selectedColor,
    onColorChange,
    className = "",
}: MarkupModeFieldsProps) {
    return (
        <div className={className}>
            <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase text-[color:var(--muted)]">Mode</label>
                <select
                    value={mode}
                    onChange={(e) => onModeChange(e.target.value as MarkupMode)}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-2 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                >
                    <option value="smart" disabled={!canUseSmartMode}>
                        Smart (text first, OCR fallback)
                    </option>
                    <option value="manual">{config.manualModeLabel}</option>
                    <option value="ocr">OCR page</option>
                </select>
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase text-[color:var(--muted)]">{config.colorLabel}</label>
                <div className="flex flex-wrap items-center gap-2">
                    {config.colors.map((c) => (
                        <button
                            key={c.hex}
                            type="button"
                            onClick={() => onColorChange(c.hex)}
                            style={{ backgroundColor: c.hex }}
                            className={`h-8 w-8 rounded-full border-2 transition ${
                                selectedColor === c.hex
                                    ? "scale-110 border-indigo-600 shadow-md"
                                    : "border-transparent hover:scale-105"
                            }`}
                            title={c.name}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
