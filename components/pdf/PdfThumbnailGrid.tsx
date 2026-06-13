import React, { useState } from "react";
import PdfPageThumbnail from "./PdfPageThumbnail";

interface PdfThumbnailGridProps {
    thumbnails: string[];
    selectedPages: number[];
    onTogglePage: (page: number) => void;
    setSelectedPages?: React.Dispatch<React.SetStateAction<number[]>>;
}

export default function PdfThumbnailGrid({
                                             thumbnails,
                                             selectedPages,
                                             onTogglePage,
                                             setSelectedPages,
                                         }: PdfThumbnailGridProps) {
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

    const handleThumbnailClick = (pageNumber: number, e: React.MouseEvent) => {
        // Stop default browser text selections from breaking layouts during Shift hold
        if (e.shiftKey) {
            e.preventDefault();
        }

        // Handle Shift range multi-select if a prior page has been selected and setter exists
        if (e.shiftKey && lastSelectedIndex !== null && setSelectedPages) {
            const start = Math.min(lastSelectedIndex, pageNumber);
            const end = Math.max(lastSelectedIndex, pageNumber);

            const range: number[] = [];
            for (let i = start; i <= end; i++) {
                range.push(i);
            }

            setSelectedPages((prev) => {
                const combined = Array.from(new Set([...prev, ...range]));
                return combined.sort((a, b) => a - b);
            });
            return;
        }

        // Default: Fallback to single page toggle state
        onTogglePage(pageNumber);
        setLastSelectedIndex(pageNumber);
    };

    return (
        <div className="mt-8">
            <h3 className="mb-4 text-xl font-semibold">
                Page Preview
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {thumbnails.map((thumbnail, index) => {
                    const pageNumber = index + 1;
                    const selected = selectedPages.includes(pageNumber);

                    return (
                        <PdfPageThumbnail
                            key={pageNumber}
                            thumbnail={thumbnail}
                            pageNumber={pageNumber}
                            selected={selected}
                            onClick={(e) => handleThumbnailClick(pageNumber, e)}
                        />
                    );
                })}
            </div>
        </div>
    );
}