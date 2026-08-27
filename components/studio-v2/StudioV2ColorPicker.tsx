"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { StudioV2Popover } from "./StudioV2Popover";

export const DEFAULT_STUDIO_V2_COLOR_PRESETS = [
  { name: "Yellow", hex: "#FFFF00" },
  { name: "Red", hex: "#FF0000" },
  { name: "Blue", hex: "#0000FF" },
  { name: "Green", hex: "#008000" },
  { name: "Orange", hex: "#FF8800" },
  { name: "Purple", hex: "#800080" },
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
] as const;

export function normalizeStudioV2Hex(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.slice(1).split("").map((digit) => `${digit}${digit}`).join("")}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

export function isStudioV2ColorSelected(value: string, preset: string): boolean {
  const normalizedValue = normalizeStudioV2Hex(value);
  const normalizedPreset = normalizeStudioV2Hex(preset);
  return normalizedValue !== null && normalizedValue === normalizedPreset;
}

interface StudioV2ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  presets?: readonly { name: string; hex: string }[];
  disabled?: boolean;
  testId?: string;
}

export const StudioV2ColorPicker: React.FC<StudioV2ColorPickerProps> = ({
  value,
  onChange,
  label,
  presets = DEFAULT_STUDIO_V2_COLOR_PRESETS,
  disabled = false,
  testId,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState(value);
  const [customError, setCustomError] = useState<string | null>(null);
  const normalizedValue = normalizeStudioV2Hex(value) ?? "#000000";

  useEffect(() => {
    setCustomValue(normalizedValue);
  }, [normalizedValue]);

  const choosePreset = (hex: string) => {
    const normalized = normalizeStudioV2Hex(hex);
    if (!normalized) return;
    setCustomValue(normalized);
    setCustomError(null);
    onChange(normalized);
    setOpen(false);
  };

  const applyCustom = () => {
    const normalized = normalizeStudioV2Hex(customValue);
    if (!normalized) {
      setCustomError("Use a valid hex color such as #33AAFF.");
      return;
    }
    setCustomValue(normalized);
    setCustomError(null);
    onChange(normalized);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((current) => !current)}
        className="studio-v2-focus flex w-full items-center justify-between rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2 py-1.5 text-left text-xs text-[var(--studio-text)] hover:border-[var(--studio-border-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="flex items-center gap-2">
          <span className="h-5 w-5 rounded border border-[var(--studio-border-hover)]" style={{ backgroundColor: normalizedValue }} aria-hidden="true" />
          <span>{normalizedValue}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--studio-muted)]" aria-hidden="true" />
      </button>
      <StudioV2Popover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        label={`${label} options`}
        width={280}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={`${label} presets`}>
            {presets.map((preset) => {
              const presetHex = normalizeStudioV2Hex(preset.hex) ?? preset.hex;
              const selected = isStudioV2ColorSelected(normalizedValue, presetHex);
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => choosePreset(preset.hex)}
                  aria-label={`${preset.name}, ${presetHex}`}
                  aria-pressed={selected}
                  title={preset.name}
                  className={`studio-v2-focus flex flex-col items-center gap-1 rounded border p-1.5 text-[10px] transition-colors ${selected ? "border-[var(--studio-border-active)] bg-[var(--studio-cta)]/15 text-white" : "border-[var(--studio-border)] text-[var(--studio-muted)] hover:border-[var(--studio-border-hover)] hover:text-white"}`}
                >
                  <span className="relative h-7 w-7 rounded border border-[var(--studio-border-hover)]" style={{ backgroundColor: presetHex }} aria-hidden="true">
                    {selected && <Check className="absolute inset-0 m-auto h-4 w-4 text-[var(--studio-text)] drop-shadow" aria-hidden="true" />}
                  </span>
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-[var(--studio-border)] pt-3">
            <label className="block space-y-1 text-[10px] text-[var(--studio-muted)]">
              <span className="flex items-center gap-1"><Palette className="h-3 w-3" aria-hidden="true" /> Custom hex</span>
              <div className="flex gap-2">
                <input
                  value={customValue}
                  onChange={(event) => { setCustomValue(event.target.value); setCustomError(null); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyCustom(); } }}
                  aria-label={`${label} custom hex`}
                  aria-invalid={Boolean(customError)}
                  className="studio-v2-focus min-w-0 flex-1 rounded border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] px-2 py-1.5 font-mono text-xs text-[var(--studio-text)] outline-none"
                  placeholder="#33AAFF"
                />
                <button type="button" onClick={applyCustom} className="studio-v2-focus studio-v2-primary rounded px-2.5 py-1.5 text-[11px] text-white">Apply</button>
              </div>
            </label>
            {customError && <p className="mt-1 text-[10px] text-red-300" role="alert">{customError}</p>}
          </div>
        </div>
      </StudioV2Popover>
    </div>
  );
};
