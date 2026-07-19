"use client";

import { useEffect, useState } from "react";
import { NAV_TOOLS } from "@/lib/toolsData";
import { fetchJson } from "@/lib/api";
import {getFrontUrl} from "@/lib/getFrontUrl";

interface BackendTool {
    Title?: string;
    title?: string;
    Name?: string;
    name?: string;
    Description?: string;
    description?: string;
    Href?: string;
    href?: string;
    Features?: string[];
    features?: string[];
}

export default function ToolSchema({
                                       toolHref,
                                   }: {
    toolHref: string;
}) {
    const localTool = NAV_TOOLS.find((t) => t.href === toolHref);

    // Hydrate default structure with local configurations to maintain valid SEO schema on immediate mount
    const [toolData, setToolData] = useState({
        title: localTool?.title || "PDF Tool",
        description: localTool?.description || "Free secure online document tools",
        href: toolHref,
        features: localTool?.features || []
    });

    useEffect(() => {
        fetchJson("/site-content/tools")
            .then((data: unknown) => {
                if (Array.isArray(data) && data.length > 0) {
                    const tools = data as BackendTool[];
                    const found = tools.find((t) => (t.Href || t.href) === toolHref);
                    if (found) {
                        setToolData({
                            title: found.Title || found.title || found.Name || found.name || localTool?.title || "PDF Tool",
                            description: found.Description || found.description || localTool?.description || "Free secure online document tools",
                            href: found.Href || found.href || toolHref,
                            features: found.Features || found.features || localTool?.features || []
                        });
                    }
                }
            })
            .catch((err) => {
                console.error("Error matching schema records against remote db mapping:", err);
            });
    }, [toolHref, localTool]);

    const schema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: `${toolData.title} - PDFNest`,
        applicationCategory: "DocumentManagementApplication",
        operatingSystem: "Web",
        description: toolData.description,
        url: `${getFrontUrl()}${toolData.href}`,
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
            name: "PDFNest"
        }
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(schema)
            }}
        />
    );
}