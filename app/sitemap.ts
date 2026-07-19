import type { MetadataRoute } from "next";
import { NAV_TOOLS } from "@/lib/toolsData";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfnest.gimesha.dev").replace(/\/$/, "");

function url(pathname: string): string {
    return new URL(pathname.startsWith("/") ? pathname : `/${pathname}`, BASE_URL).toString();
}

export default function sitemap(): MetadataRoute.Sitemap {
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: url("/"),
            changeFrequency: "weekly",
            priority: 1,
        },
        {
            url: url("/about"),
            changeFrequency: "monthly",
            priority: 0.6,
        },
        {
            url: url("/tools"),
            changeFrequency: "weekly",
            priority: 0.9,
        },
        {
            url: url("/privacy"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
    ];

    const toolPages: MetadataRoute.Sitemap = NAV_TOOLS.map((tool) => ({
        url: url(tool.href),
        changeFrequency: "weekly",
        priority: 0.8,
    }));

    return [...staticPages, ...toolPages];
}