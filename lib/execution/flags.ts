"use client";

export function isClientExecutionEnabled(toolId: string): boolean {
    const globalEnabled = process.env.NEXT_PUBLIC_HYBRID_PROCESSING_ENABLED === "true";
    
    // Normalize toolId to handle aliases (e.g. rotate_pdf -> rotate, delete_pages -> delete)
    const normalizedToolId = normalizeToolId(toolId);

    if (!globalEnabled) {
        // Check if there is an explicit localStorage override for debugging
        if (typeof window !== "undefined") {
            const override = localStorage.getItem(`flag_${normalizedToolId}`);
            if (override === "true") return true;
        }
        return false;
    }

    if (typeof window !== "undefined") {
        const override = localStorage.getItem(`flag_${normalizedToolId}`);
        if (override === "false") return false;
        if (override === "true") return true;
    }

    const toolEnvKey = `NEXT_PUBLIC_TOOL_${normalizedToolId.toUpperCase()}_CLIENT`;
    return process.env[toolEnvKey] === "true";
}

function normalizeToolId(toolId: string): string {
    switch (toolId) {
        case "rotate_pdf":
            return "rotate";
        case "split_pdf":
            return "split";
        case "delete_pages":
            return "delete";
        case "reorder_pages":
            return "reorder";
        case "insert_blank":
            return "insert_blank";
        case "update_metadata":
            return "update_metadata";
        default:
            return toolId;
    }
}
