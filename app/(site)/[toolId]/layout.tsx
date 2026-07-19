import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getToolMetadata } from "@/lib/seo";
import ClientToolLayout from "./ClientToolLayout";

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
    return <ClientToolLayout>{children}</ClientToolLayout>;
}