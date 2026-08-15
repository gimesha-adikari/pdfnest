import { fetchJson } from "@/lib/api";
import { NAV_TOOLS_FALLBACK, ToolFAQ, ToolItem } from "@/lib/toolsData";

function parseJsonField<T>(raw: unknown, field: string, toolHref: string): T[] {
    if (typeof raw !== "string" || raw.trim() === "") return [];

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (err) {
        console.warn(`Ignoring malformed ${field} for tool "${toolHref}":`, err);
        return [];
    }
}

export function normalizeTool(rawTool: any): ToolItem | null {
    if (!rawTool || typeof rawTool !== "object") return null;

    const href = rawTool.href || rawTool.Href || rawTool.slug || rawTool.Slug;
    const title = rawTool.title || rawTool.Title || rawTool.name || rawTool.Name;
    const category = rawTool.category || rawTool.Category;
    const description = rawTool.description || rawTool.Description || "";

    if (!href || typeof href !== "string" || !title || typeof title !== "string") {
        console.warn("INVALID TOOL EXCLUDED FROM NORMALIZATION:", rawTool);
        return null;
    }

    const cleanHref = href.startsWith("/") ? href : `/${href}`;

    return {
        ID: rawTool.ID || rawTool.id,
        title,
        description,
        href: cleanHref,
        category: (category || "organize").toLowerCase(),
        keywords: Array.isArray(rawTool.keywords)
            ? rawTool.keywords
            : parseJsonField<string>(rawTool.keywordsJson || rawTool.KeywordsJson, "keywordsJson", cleanHref),
        seoTitle: rawTool.seoTitle || rawTool.SeoTitle || "",
        seoDescription: rawTool.seoDescription || rawTool.SeoDescription || "",
        intent: rawTool.intent || rawTool.Intent || "",
        related: Array.isArray(rawTool.related)
            ? rawTool.related
            : parseJsonField<string>(rawTool.relatedJson || rawTool.RelatedJson, "relatedJson", cleanHref),
        faq: Array.isArray(rawTool.faq)
            ? rawTool.faq
            : parseJsonField<ToolFAQ>(rawTool.faqJson || rawTool.FaqJson, "faqJson", cleanHref),
        features: Array.isArray(rawTool.features)
            ? rawTool.features
            : parseJsonField<string>(rawTool.featuresJson || rawTool.FeaturesJson, "featuresJson", cleanHref),
        isNew: rawTool.isNew !== undefined ? rawTool.isNew : rawTool.IsNew || false,
        accept: rawTool.accept || rawTool.Accept || ".pdf",
        multiple: rawTool.multiple !== undefined ? rawTool.multiple : rawTool.Multiple || false,
        iconName: rawTool.iconName || rawTool.IconName || rawTool.icon || rawTool.Icon || "FileText",
    } as ToolItem;
}

export async function getTools(): Promise<ToolItem[]> {
    try {
        const tools = await fetchJson<any[]>("/site-content/tools", {
            next: { revalidate: 3600, tags: ["tools"] },
        });

        if (Array.isArray(tools) && tools.length > 0) {
            const normalized = tools
                .filter((t) => t.isActive !== false && t.is_active !== false && t.IsActive !== false)
                .map(normalizeTool)
                .filter((t): t is ToolItem => t !== null);

            if (normalized.length > 0) {
                return normalized;
            }
        }

        console.warn("No active tools returned by the backend; using the bundled fallback list.");
        return NAV_TOOLS_FALLBACK.map(normalizeTool).filter((t): t is ToolItem => t !== null);
    } catch (err) {
        console.error("Failed to load tools from the backend; using the bundled fallback list:", err);
        return NAV_TOOLS_FALLBACK.map(normalizeTool).filter((t): t is ToolItem => t !== null);
    }
}

export async function getToolBySlug(slug: string): Promise<ToolItem | undefined> {
    const cleanSlug = slug.startsWith("/") ? slug : `/${slug}`;
    const tools = await getTools();
    return tools.find((t) => t.href === cleanSlug);
}
