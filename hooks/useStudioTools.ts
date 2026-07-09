"use client";

import { useState } from "react";
import { StudioToolId } from "@/components/studio/ToolBar";

export function useStudioTools() {
    const [activeTool, setActiveTool] =
        useState<StudioToolId>("select");

    return {
        activeTool,
        setActiveTool,
    };
}