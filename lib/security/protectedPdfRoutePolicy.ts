import { NAV_TOOLS_FALLBACK } from "@/lib/toolsData";

export type ProtectedPdfRoutePolicy =
    | "execution-manager"
    | "cloud-only"
    | "cloud-consent"
    | "explicit-unlock"
    | "studio-session-consent"
    | "unqualified";

function acceptsPdf(accept?: string): boolean {
    return (accept || "").split(",").some((item) => {
        const normalized = item.trim().toLowerCase();
        return normalized === ".pdf" || normalized === "application/pdf";
    });
}

export function getProtectedPdfRoutePolicy(toolId: string): ProtectedPdfRoutePolicy {
    const route = NAV_TOOLS_FALLBACK.find((tool) => tool.href.replace(/^\//, "").split(/[?#]/)[0] === toolId);
    if (!route) return "unqualified";
    if (route.protectedPdfPolicy) return route.protectedPdfPolicy;
    if (!acceptsPdf(route.accept)) return "unqualified";

    if (route.toolPolicy === "BACKEND_ONLY" || route.toolPolicy === "SECURITY_CRITICAL_BACKEND") {
        return "cloud-only";
    }

    if (
        route.capability?.clientExecutable === true &&
        route.capability.workspaceOffline === true &&
        (route.toolPolicy === "CLIENT_PREFERRED" || route.toolPolicy === "HYBRID")
    ) {
        return "execution-manager";
    }

    return "unqualified";
}
