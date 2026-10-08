import {writeFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {NAV_TOOLS_FALLBACK, type ToolItem} from "../../lib/toolsData";
import {normalizeTool, mergeToolCatalog} from "../../lib/server/tools";

type AuditStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED" | "NOT_APPLICABLE";

function recipe(t: ToolItem): string {
    if (t.href === "/url-to-pdf") return "safe-own-domain-URL";
    if (t.href === "/repository-analyzer") return "synthetic-small-repo-zip";
    if (t.href === "/images-to-pdf") return "synthetic-png-pair";
    if (t.href.includes("image-to") || t.href.includes("searchable-pdf")) return "synthetic-png";
    if (t.href === "/merge-pdf") return "two-one-page-synthetic-pdfs";
    if (t.href === "/word-to-pdf") return "synthetic-docx";
    if (t.href === "/excel-to-pdf") return "synthetic-xlsx";
    if (t.href === "/powerpoint-to-pdf") return "synthetic-pptx";
    if (t.href === "/code-to-pdf") return "synthetic-source";
    if (t.href === "/markdown-to-pdf") return "synthetic-markdown";
    return "synthetic-two-page-pdf";
}

async function main() {
    const cmsUrl = "https://api.platenpdf.com/api/site-content/tools";
    let cmsAvailability: "SUCCESS" | "FAILED" = "FAILED";
    let cmsError: string | null = null;
    let cmsTools: ToolItem[] = [];
    try {
        const response = await fetch(cmsUrl, {signal: AbortSignal.timeout(12000), headers: {Accept: "application/json"}});
        if (!response.ok) throw new Error("CMS HTTP " + response.status);
        const raw = await response.json();
        if (!Array.isArray(raw)) throw new Error("CMS payload was not an array");
        cmsTools = raw
            .filter((t) => t.isActive !== false && t.is_active !== false && t.IsActive !== false)
            .map(normalizeTool)
            .filter((t): t is ToolItem => t !== null);
        cmsAvailability = "SUCCESS";
    } catch (err) {
        cmsError = err instanceof Error ? err.message : String(err);
    }
    const merged = mergeToolCatalog(cmsTools, NAV_TOOLS_FALLBACK);
    const rows = merged.map((t) => ({
        route: t.href,
        title: t.title,
        category: t.category,
        policy: t.toolPolicy ?? "UNCLASSIFIED",
        requiresBackend: t.capability?.requiresBackend ?? null,
        workspaceOffline: t.capability?.workspaceOffline ?? null,
        acceptedInput: t.accept ?? ".pdf",
        supportsMultiple: t.multiple ?? false,
        fixture: recipe(t),
        guest: "NOT_TESTED" as AuditStatus,
        freeAccount: "BLOCKED" as AuditStatus,
        existingPaidAccount: "BLOCKED" as AuditStatus,
        outputValidation: "NOT_TESTED" as AuditStatus,
        guestCreditBalanceVerification: "NOT_APPLICABLE" as AuditStatus,
        lastEvidenceRef: null,
    })).sort((a,b) => a.route.localeCompare(b.route));
    const unique = new Set(rows.map(x => x.route));
    if (unique.size !== rows.length) throw new Error("Duplicate public tool route in inventory");
    const snapshot = {
        schema: "platen.gim33.audit.inventory.v1",
        generatedAt: new Date().toISOString(),
        sourceFrontendCommit: "0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b",
        sourceBackendCommit: "296838852195f96ca5590b3466a33ec5ae3e39d9",
        cms: {availability: cmsAvailability, activeRows: cmsTools.length, error: cmsError},
        baselineFallbackCount: NAV_TOOLS_FALLBACK.length,
        count: rows.length,
        note: "Initial inventory status is not test coverage. Browser evidence is tracked separately.",
        tools: rows,
    };
    const outputDir = path.resolve(process.cwd(), "artifacts/gim33");
    mkdirSync(outputDir, {recursive: true});
    const outputPath = path.join(outputDir, "inventory.json");
    writeFileSync(outputPath, JSON.stringify(snapshot,null,2)+"\n");
    console.log(JSON.stringify({path:outputPath,count:rows.length,fallbackCount:NAV_TOOLS_FALLBACK.length,cmsAvailability,cmsActive:cmsTools.length,byPolicy:rows.reduce((o,r)=>(o[r.policy]=(o[r.policy]??0)+1,o),{} as Record<string,number>)},null,2));
    if (cmsAvailability === "FAILED") process.exitCode = 2;
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
