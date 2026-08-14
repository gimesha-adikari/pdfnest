import { NAV_TOOLS_FALLBACK } from "@/lib/toolsData";

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

export function getSuggestedNextTools(currentHref: string, limit = 3, toolsList?: any[]): NavTool[] {
    const list = (toolsList && toolsList.length > 0 ? toolsList : NAV_TOOLS_FALLBACK) as any[];
    const current = list.find((tool: any) => (tool.href || tool.Href) === currentHref) as NavTool | undefined;
    if (!current) return [];

    const picked = new Map<string, NavTool>();

    const addHref = (hrefValue: string | undefined) => {
        const href = (hrefValue || "").startsWith("/") ? hrefValue! : `/${hrefValue || ""}`;
        if (!href || href === currentHref || picked.has(href)) return;

        const found = list.find((tool: any) => (tool.href || tool.Href) === href) as NavTool | undefined;
        if (found) picked.set(href, found);
    };

    let relatedList: string[] = [];
    if (Array.isArray(current.related)) {
        relatedList = current.related;
    } else if ((current as any).RelatedJson) {
        try {
            relatedList = JSON.parse((current as any).RelatedJson);
        } catch (err) {
            console.warn(`Ignoring malformed RelatedJson for tool "${currentHref}":`, err);
        }
    }

    relatedList.forEach(addHref);
    (HINTS[currentHref] || []).forEach(addHref);

    if (picked.size < limit) {
        const currentCategory = current.category || (current as any).Category;
        const sameCategory = list.filter((tool: any) => {
            const toolHref = tool.href || tool.Href;
            const toolCategory = tool.category || tool.Category;
            if (toolHref === currentHref) return false;
            if (!currentCategory || !toolCategory) return false;
            return String(toolCategory).toLowerCase() === String(currentCategory).toLowerCase();
        }) as NavTool[];

        for (const tool of sameCategory) {
            addHref(tool.href || (tool as any).Href);
            if (picked.size >= limit) break;
        }
    }

    if (picked.size < limit) {
        for (const tool of list) {
            addHref(tool.href || tool.Href);
            if (picked.size >= limit) break;
        }
    }

    return Array.from(picked.values()).slice(0, limit);
}