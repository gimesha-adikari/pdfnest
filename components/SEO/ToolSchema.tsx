"use client";

import { useMemo } from "react";
import { useTools } from "@/context/ToolContext";
import { toSiteUrl } from "@/lib/siteUrl";

export default function ToolSchema({
    toolHref,
}: {
    toolHref: string;
}) {
    const { getToolByHref } = useTools();
    const tool = getToolByHref(toolHref);

    const toolData = useMemo(() => ({
        title: tool?.title || (tool as any)?.Title || "PDF Tool",
        description: tool?.description || (tool as any)?.Description || "Free secure online document tools",
        href: tool?.href || toolHref,
        features: tool?.features || []
    }), [tool, toolHref]);

    const schema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: `${toolData.title} - Platen PDF`,
        applicationCategory: "DocumentManagementApplication",
        operatingSystem: "Web",
        description: toolData.description,
        url: toSiteUrl(toolData.href),
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
        },
        featureList: toolData.features.length > 0
            ? toolData.features
            : [
                toolData.title,
                "Free PDF processing",
                "Secure online document tools"
            ],
        publisher: {
            "@type": "Organization",
            name: "Platen",
            url: toSiteUrl("/"),
        }
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(schema).replace(/</g, "\\u003c")
            }}
        />
    );
}
