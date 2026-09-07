import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getToolMetadata } from "@/lib/seo";
import { getToolBySlug } from "@/lib/server/tools";
import { getOcrV2DevelopmentRouteConfig } from "@/lib/ocrV2DevelopmentTools";
import ClientToolLayout from "./ClientToolLayout";
import { resolveEditPdfEditorEngine } from "@/lib/editPdfEngine";

type ToolLayoutParams = {
    toolId: string;
};

export async function generateMetadata(
    { params }: { params: Promise<ToolLayoutParams> }
): Promise<Metadata> {
    const { toolId } = await params;
    const toolHref = `/${toolId}`;
    const [tool, developmentSurface] = await Promise.all([
        getToolBySlug(toolHref),
        Promise.resolve(getOcrV2DevelopmentRouteConfig(toolId)),
    ]);

    if (!tool && !developmentSurface) notFound();

    return getToolMetadata(toolHref);
}

export default async function ToolRouteLayout({
                                                 params,
                                                 children,
                                             }: {
    params: Promise<ToolLayoutParams>;
    children: ReactNode;
}) {
    const { toolId } = await params;
    const toolHref = `/${toolId}`;
    const [tool, developmentSurface] = await Promise.all([
        getToolBySlug(toolHref),
        Promise.resolve(getOcrV2DevelopmentRouteConfig(toolId)),
    ]);

    // The client guard is useful after CMS hydration, but it cannot change
    // the initial HTTP response. Validate here so arbitrary dynamic slugs do
    // not render the generic, indexable PDF Tool page.
    if (!tool && !developmentSurface) notFound();

    const editPdfEngine = resolveEditPdfEditorEngine(process.env.EDIT_PDF_EDITOR_ENGINE);
    return <ClientToolLayout editPdfEngine={editPdfEngine}>{children}</ClientToolLayout>;
}
