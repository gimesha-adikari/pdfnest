import { Highlighter, Strikethrough, Underline } from "lucide-react";
import type { LucideIcon } from "@/lib/iconResolver";
import type { MarkupKind } from "./types";

export interface MarkupColor {
    name: string;
    hex: string;
}

/** How a drawn box is painted on the preview canvas. */
export type MarkupOverlayStyle = "fill" | "underline" | "strike";

export interface MarkupToolConfig {
    kind: MarkupKind;
    icon: LucideIcon;
    colors: MarkupColor[];
    defaultColor: string;
    overlayStyle: MarkupOverlayStyle;
    /** Suffix appended to the source file name, e.g. `report-highlighted.pdf`. */
    fileSuffix: string;
    heroTitle: string;
    heroDescription: string;
    configurationTitle: string;
    canvasTitle: string;
    colorLabel: string;
    /** Label of the manual mode, reused in mode options and analysis hints. */
    manualModeLabel: string;
    selectedBoxLabel: string;
    saveLabel: string;
    savingLabel: string;
    analysisHint: string;
    emptyBoxesWarning: string;
    queuedNotice: string;
    failureMessage: string;
    successTitle: string;
    studioSuccessNotice: string;
    studioSuccessDescription: string;
    workspaceSuccessNotice: string;
    workspaceSuccessDescription: string;
}

export const MARKUP_TOOLS: Record<MarkupKind, MarkupToolConfig> = {
    highlight: {
        kind: "highlight",
        icon: Highlighter,
        colors: [
            { name: "Yellow", hex: "#FFFF00" },
            { name: "Green", hex: "#00FF00" },
            { name: "Blue", hex: "#00FFFF" },
            { name: "Pink", hex: "#FF00FF" },
            { name: "Orange", hex: "#FF8800" },
        ],
        defaultColor: "#FFFF00",
        overlayStyle: "fill",
        fileSuffix: "highlighted",
        heroTitle: "Highlight PDF Text",
        heroDescription:
            "Select text-like regions, choose Smart / Manual / OCR, and bake the highlight into the PDF.",
        configurationTitle: "Highlighter Configuration",
        canvasTitle: "Highlight Canvas",
        colorLabel: "Active Marker Color",
        manualModeLabel: "Manual highlight",
        selectedBoxLabel: "Marker selected",
        saveLabel: "Save Highlight Markers",
        savingLabel: "Baking Highlights...",
        analysisHint: "Detecting text pages before highlight processing.",
        emptyBoxesWarning: "Please draw at least one highlighting box on the document.",
        queuedNotice: "Highlight job queued. Waiting for worker...",
        failureMessage: "Highlight processing failed",
        successTitle: "Highlights baked successfully!",
        studioSuccessNotice: "Highlighted PDF loaded back into Studio.",
        studioSuccessDescription: "The highlighted PDF has been loaded back into Studio.",
        workspaceSuccessNotice: "Highlighted PDF ready.",
        workspaceSuccessDescription:
            "The document layer transformations have been permanently generated over the document layout.",
    },
    underline: {
        kind: "underline",
        icon: Underline,
        colors: [
            { name: "Red", hex: "#FF4D4D" },
            { name: "Blue", hex: "#4D7CFF" },
            { name: "Green", hex: "#22C55E" },
            { name: "Orange", hex: "#F97316" },
            { name: "Purple", hex: "#A855F7" },
        ],
        defaultColor: "#FF4D4D",
        overlayStyle: "underline",
        fileSuffix: "underlined",
        heroTitle: "Underline PDF Text",
        heroDescription:
            "Select text-like regions, choose Smart / Manual / OCR, and bake the underline into the PDF.",
        configurationTitle: "Underline Configuration",
        canvasTitle: "Underline Canvas",
        colorLabel: "Active Line Color",
        manualModeLabel: "Manual line",
        selectedBoxLabel: "Underline selected",
        saveLabel: "Save Underline Markers",
        savingLabel: "Baking Underlines...",
        analysisHint: "Detecting text pages before underline processing.",
        emptyBoxesWarning: "Please draw at least one underline box on the document.",
        queuedNotice: "Underline job queued. Waiting for worker...",
        failureMessage: "Underline processing failed",
        successTitle: "Underlines baked successfully!",
        studioSuccessNotice: "Underlined PDF loaded back into Studio.",
        studioSuccessDescription: "The underlined PDF has been loaded back into Studio.",
        workspaceSuccessNotice: "Underline PDF ready.",
        workspaceSuccessDescription: "The underline marks have been permanently applied to your PDF.",
    },
    strikeout: {
        kind: "strikeout",
        icon: Strikethrough,
        colors: [
            { name: "Red", hex: "#FF0000" },
            { name: "Black", hex: "#000000" },
            { name: "Blue", hex: "#0066FF" },
            { name: "Green", hex: "#00AA00" },
        ],
        defaultColor: "#000000",
        overlayStyle: "strike",
        fileSuffix: "strikeout",
        heroTitle: "Strikeout PDF Text",
        heroDescription:
            "Select text-like regions, choose Smart / Manual / OCR, and permanently strike through the selected text.",
        configurationTitle: "Strikeout Configuration",
        canvasTitle: "Strikeout Canvas",
        colorLabel: "Active Marker Color",
        manualModeLabel: "Manual strikeout",
        selectedBoxLabel: "Marker selected",
        saveLabel: "Save Strikeouts",
        savingLabel: "Applying Strikeouts...",
        analysisHint: "Detecting text pages before strikeout processing.",
        emptyBoxesWarning: "Please draw at least one strikeout area on the document.",
        queuedNotice: "Strikeout job queued. Waiting for worker...",
        failureMessage: "Strikeout processing failed",
        successTitle: "Strikeouts applied successfully!",
        studioSuccessNotice: "Strikeout PDF loaded back into Studio.",
        studioSuccessDescription: "The strikeout PDF has been loaded back into Studio.",
        workspaceSuccessNotice: "Strikeout PDF ready.",
        workspaceSuccessDescription:
            "The document layer transformations have been permanently generated over the document layout.",
    },
};
