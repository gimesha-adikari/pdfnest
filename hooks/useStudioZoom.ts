"use client";

import { useState } from "react";

export function useStudioZoom() {
    const [zoom, setZoom] = useState(1);

    const zoomIn = () =>
        setZoom((z) =>
            Math.min(3, Number((z + 0.15).toFixed(2)))
        );

    const zoomOut = () =>
        setZoom((z) =>
            Math.max(0.5, Number((z - 0.15).toFixed(2)))
        );

    const zoomReset = () => setZoom(1);

    return {
        zoom,
        zoomIn,
        zoomOut,
        zoomReset,
        setZoom,
    };
}