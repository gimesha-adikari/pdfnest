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

// Static fallback map indexed by lowercase clean href for runtime capability inheritance
const staticFallbackMap = new Map<string, ToolItem>();
for (const item of NAV_TOOLS_FALLBACK) {
    if (item.href) {
        const cleanKey = item.href.startsWith("/") ? item.href.toLowerCase() : `/${item.href.toLowerCase()}`;
        staticFallbackMap.set(cleanKey, item);
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
    const staticFallback = staticFallbackMap.get(cleanHref.toLowerCase());

    return {
        ID: rawTool.ID || rawTool.id,
        title,
        description,
        href: cleanHref,
        category: (category || staticFallback?.category || "organize").toLowerCase(),
        keywords: Array.isArray(rawTool.keywords)
            ? rawTool.keywords
            : parseJsonField<string>(rawTool.keywordsJson || rawTool.KeywordsJson, "keywordsJson", cleanHref),
        seoTitle: rawTool.seoTitle || rawTool.SeoTitle || staticFallback?.seoTitle || "",
        seoDescription: rawTool.seoDescription || rawTool.SeoDescription || staticFallback?.seoDescription || "",
        intent: rawTool.intent || rawTool.Intent || staticFallback?.intent || "",
        related: Array.isArray(rawTool.related)
            ? rawTool.related
            : parseJsonField<string>(rawTool.relatedJson || rawTool.RelatedJson, "relatedJson", cleanHref),
        faq: Array.isArray(rawTool.faq)
            ? rawTool.faq
            : parseJsonField<ToolFAQ>(rawTool.faqJson || rawTool.FaqJson, "faqJson", cleanHref),
        features: Array.isArray(rawTool.features)
            ? rawTool.features
            : parseJsonField<string>(rawTool.featuresJson || rawTool.FeaturesJson, "featuresJson", cleanHref),
        isNew: rawTool.isNew !== undefined ? rawTool.isNew : (rawTool.IsNew ?? staticFallback?.isNew ?? false),
        accept: rawTool.accept || rawTool.Accept || staticFallback?.accept || ".pdf",
        multiple: rawTool.multiple !== undefined ? rawTool.multiple : (rawTool.Multiple ?? staticFallback?.multiple ?? false),
        iconName: rawTool.iconName || rawTool.IconName || rawTool.icon || rawTool.Icon || staticFallback?.iconName || "FileText",
        // Capability metadata — precedence: CMS field -> static registry fallback
        capability: rawTool.capability || rawTool.Capability || staticFallback?.capability,
        clientCapable: rawTool.clientCapable ?? rawTool.ClientCapable ?? staticFallback?.clientCapable,
        toolPolicy: rawTool.toolPolicy || rawTool.ToolPolicy || staticFallback?.toolPolicy,
        offlineReason: rawTool.offlineReason || rawTool.OfflineReason || staticFallback?.offlineReason || staticFallback?.capability?.offlineReason,
    } as ToolItem;
}

export function getToolCanonicalKey(tool: ToolItem): string {
    const href = tool.href || (tool as any).Href || (tool as any).slug || (tool as any).Slug || "";
    if (!href || typeof href !== "string") return "";
    return href.startsWith("/") ? href.toLowerCase() : `/${href.toLowerCase()}`;
}

export function mergeToolCatalog(
    backendTools: ToolItem[],
    staticTools: ToolItem[]
): ToolItem[] {
    const result: ToolItem[] = [];
    const seenKeys = new Set<string>();

    if (Array.isArray(backendTools)) {
        for (const tool of backendTools) {
            if (!tool) continue;
            const key = getToolCanonicalKey(tool);
            if (key && !seenKeys.has(key)) {
                seenKeys.add(key);
                result.push(tool);
            }
        }
    }

    if (Array.isArray(staticTools)) {
        for (const tool of staticTools) {
            if (!tool) continue;
            const key = getToolCanonicalKey(tool);
            if (key && !seenKeys.has(key)) {
                seenKeys.add(key);
                result.push(tool);
            }
        }
    }

    return result;
}

export async function getTools(): Promise<ToolItem[]> {
    const staticNormalized = NAV_TOOLS_FALLBACK.map(normalizeTool).filter((t): t is ToolItem => t !== null);

    try {
        const tools = await fetchJson<any[]>("/site-content/tools", {
            next: { revalidate: 3600, tags: ["tools"] },
        });

        if (Array.isArray(tools) && tools.length > 0) {
            const backendNormalized = tools
                .filter((t) => t.isActive !== false && t.is_active !== false && t.IsActive !== false)
                .map(normalizeTool)
                .filter((t): t is ToolItem => t !== null);

            return mergeToolCatalog(backendNormalized, staticNormalized);
        }

        return staticNormalized;
    } catch (err) {
        console.warn("Failed to load tools from backend; using bundled static catalog:", err);
        return staticNormalized;
    }
}

export async function getToolBySlug(slug: string): Promise<ToolItem | undefined> {
    const cleanSlug = slug.startsWith("/") ? slug : `/${slug}`;
    const tools = await getTools();
    return tools.find((t) => t.href === cleanSlug);
}
