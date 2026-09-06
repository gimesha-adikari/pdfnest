import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getToolMetadata } from "@/lib/seo";
import ClientToolLayout from "./ClientToolLayout";
import { resolveEditPdfEditorEngine } from "@/lib/editPdfEngine";

type ToolLayoutParams = {
    toolId: string;
};

export async function generateMetadata(
    { params }: { params: Promise<ToolLayoutParams> }
): Promise<Metadata> {
    const { toolId } = await params;
    return getToolMetadata(`/${toolId}`);
}

export default function ToolRouteLayout({
                                            children,
                                        }: {
    children: ReactNode;
}) {
    const editPdfEngine = resolveEditPdfEditorEngine(process.env.EDIT_PDF_EDITOR_ENGINE);
    return <ClientToolLayout editPdfEngine={editPdfEngine}>{children}</ClientToolLayout>;
}