"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePreview } from "@/lib/preview/usePreview";
import { PreviewError, PreviewRendererPreference } from "@/lib/preview/types";

export interface LazyPdfThumbnailProps {
    file: File | null;
    page: number;
    scale?: number;
    renderer?: PreviewRendererPreference;
    className?: string;
    rootMargin?: string;
    children?: (state: { src: string; isLoading: boolean; error: PreviewError | null; isVisible: boolean }) => React.ReactNode;
}

export default function LazyPdfThumbnail({
    file,
    page,
    scale = 0.3,
    renderer,
    className = "",
    rootMargin = "200px 0px",
    children,
}: LazyPdfThumbnailProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof IntersectionObserver === "undefined") {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry && entry.isIntersecting) {
                    setIsVisible(true);
                    // Once visible, keep loaded so scrolling back up doesn't flicker
                    observer.disconnect();
                }
            },
            { rootMargin }
        );

        observer.observe(el);

        return () => {
            observer.disconnect();
        };
    }, [rootMargin]);

    const { src, isLoading, error } = usePreview({
        file,
        page,
        scale,
        renderer,
        enabled: isVisible && Boolean(file),
        mode: "thumbnail",
    });

    return (
        <div ref={containerRef} className={className}>
            {children ? (
                children({ src, isLoading, error, isVisible })
            ) : (
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                    {src ? (
                        <img src={src} alt={`Page ${page}`} className="w-full h-full object-cover rounded-md" />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full bg-[color:var(--background)]/50 text-[color:var(--muted)] text-xs">
                            {isLoading ? "Loading..." : `Page ${page}`}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
