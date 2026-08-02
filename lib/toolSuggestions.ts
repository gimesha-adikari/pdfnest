import { NAV_TOOLS } from "@/lib/toolsData";

type NavTool = {
    title: string;
    description?: string;
    href: string;
    category?: string;
    related?: string[];
};

const HINTS: Record<string, string[]> = {
    "/merge-pdf": ["/split-pdf", "/compress-pdf", "/reorder-pages"],
    "/split-pdf": ["/merge-pdf", "/reorder-pages", "/delete-pages"],
    "/compress-pdf": ["/pdf-to-word", "/pdf-to-images", "/protect-pdf"],
    "/rotate-pdf": ["/reorder-pages", "/delete-pages", "/merge-pdf"],
    "/delete-pages": ["/reorder-pages", "/merge-pdf", "/split-pdf"],
    "/reorder-pages": ["/merge-pdf", "/split-pdf", "/delete-pages"],
    "/protect-pdf": ["/unlock-pdf", "/sign-pdf", "/watermark-pdf"],
    "/unlock-pdf": ["/protect-pdf", "/sign-pdf", "/edit-pdf"],
    "/watermark-pdf": ["/protect-pdf", "/sign-pdf", "/edit-pdf"],
    "/sign-pdf": ["/protect-pdf", "/unlock-pdf", "/edit-metadata"],
    "/pdf-to-word": ["/word-to-pdf", "/pdf-to-text", "/pdf-to-powerpoint"],
    "/word-to-pdf": ["/pdf-to-word", "/markdown-to-pdf", "/excel-to-pdf"],
    "/pdf-to-images": ["/images-to-pdf", "/compress-pdf", "/image-to-searchable-pdf"],
    "/images-to-pdf": ["/pdf-to-images", "/compress-pdf", "/merge-pdf"],
    "/pdf-to-text": ["/pdf-to-word", "/edit-metadata", "/image-to-searchable-pdf"],
    "/edit-pdf": ["/add-text", "/highlight-pdf", "/underline-pdf"],
    "/highlight-pdf": ["/underline-pdf", "/strikeout-pdf", "/edit-pdf"],
    "/underline-pdf": ["/highlight-pdf", "/strikeout-pdf", "/edit-pdf"],
    "/strikeout-pdf": ["/highlight-pdf", "/underline-pdf", "/edit-pdf"],
    "/repair-pdf": ["/compress-pdf", "/split-pdf", "/merge-pdf"],
    "/crop-pdf": ["/rotate-pdf", "/delete-pages", "/reorder-pages"],
    "/markdown-to-pdf": ["/word-to-pdf", "/html-to-pdf", "/code-to-pdf"],
};

export function getSuggestedNextTools(currentHref: string, limit = 3): NavTool[] {
    const current = NAV_TOOLS.find((tool: any) => tool.href === currentHref) as NavTool | undefined;
    if (!current) return [];

    const picked = new Map<string, NavTool>();

    const addHref = (hrefValue: string | undefined) => {
        const href = (hrefValue || "").startsWith("/") ? hrefValue! : `/${hrefValue || ""}`;
        if (!href || href === currentHref || picked.has(href)) return;

        const found = NAV_TOOLS.find((tool: any) => tool.href === href) as NavTool | undefined;
        if (found) picked.set(href, found);
    };

    (Array.isArray(current.related) ? current.related : []).forEach(addHref);
    (HINTS[currentHref] || []).forEach(addHref);

    if (picked.size < limit) {
        const sameCategory = NAV_TOOLS.filter((tool: any) => {
            if (tool.href === currentHref) return false;
            if (!current.category || !tool.category) return false;
            return String(tool.category).toLowerCase() === String(current.category).toLowerCase();
        }) as NavTool[];

        for (const tool of sameCategory) {
            addHref(tool.href);
            if (picked.size >= limit) break;
        }
    }

    if (picked.size < limit) {
        for (const tool of NAV_TOOLS as NavTool[]) {
            addHref(tool.href);
            if (picked.size >= limit) break;
        }
    }

    return Array.from(picked.values()).slice(0, limit);
}