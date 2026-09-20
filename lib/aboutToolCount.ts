import { TOTAL_TOOL_COUNT } from "./toolsData";

export interface AboutHighlight {
    title?: string;
    icon_type?: string;
}

export function resolveAboutToolCount(totalCount: number): number {
    return totalCount || TOTAL_TOOL_COUNT;
}

export function resolveAboutHighlightTitle(
    item: AboutHighlight,
    resolvedToolCount: number
): string {
    return item.icon_type === "file"
        ? String(resolvedToolCount) + "+ PDF Tools"
        : item.title || "";
}
