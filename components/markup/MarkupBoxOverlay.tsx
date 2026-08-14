"use client";

import type { CSSProperties } from "react";
import type { MarkupOverlayStyle } from "@/lib/markup/config";
import type { MarkupBox } from "@/lib/markup/types";

interface MarkupBoxOverlayProps {
    box: MarkupBox;
    isActive: boolean;
    scaleFactor: number;
    overlayStyle: MarkupOverlayStyle;
    onSelect: () => void;
}

const LINE_STYLES: Record<"underline" | "strike", CSSProperties> = {
    underline: { bottom: "10%" },
    strike: { top: "50%", transform: "translateY(-50%)" },
};

/** A single drawn markup box, painted according to the tool's overlay style. */
export default function MarkupBoxOverlay({
    box,
    isActive,
    scaleFactor,
    overlayStyle,
    onSelect,
}: MarkupBoxOverlayProps) {
    const isFill = overlayStyle === "fill";

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            style={{
                position: "absolute",
                left: `${box.x * scaleFactor}px`,
                top: `${box.y * scaleFactor}px`,
                width: `${box.width * scaleFactor}px`,
                height: `${box.height * scaleFactor}px`,
                ...(isFill ? { backgroundColor: box.color } : {}),
            }}
            className={`transition-all ${isFill ? "opacity-40" : ""} ${
                isActive
                    ? `z-20 ring-2 ring-indigo-600 shadow-md ${isFill ? "opacity-60" : "rounded bg-indigo-500/10"}`
                    : `z-10 ${isFill ? "hover:opacity-50" : ""}`
            }`}
        >
            {!isFill && (
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        height: "3px",
                        backgroundColor: box.color,
                        opacity: 0.95,
                        borderRadius: "9999px",
                        ...LINE_STYLES[overlayStyle],
                    }}
                />
            )}
        </div>
    );
}
