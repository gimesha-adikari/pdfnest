import type { MetadataRoute } from "next";
import { getTools } from "@/lib/server/tools";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://platenpdf.com").replace(/\/$/, "");

function url(pathname: string): string {
    return new URL(pathname.startsWith("/") ? pathname : `/${pathname}`, BASE_URL).toString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
            url: url("/pricing"),
            changeFrequency: "weekly",
            priority: 0.9,
        },
        {
            url: url("/subscribe"),
            changeFrequency: "weekly",
            priority: 0.8,
        },
        {
            url: url("/privacy"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
        {
            url: url("/acceptable-use"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
        {
            url: url("/contact"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
        {
            url: url("/cookies"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
        {
            url: url("/refund"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
        {
            url: url("/security"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
        {
            url: url("/terms"),
            changeFrequency: "monthly",
            priority: 0.3,
        },
    ];

    const tools = await getTools();
    const toolPages: MetadataRoute.Sitemap = tools.map((tool) => ({
        url: url(tool.href || (tool as any).Href),
        changeFrequency: "weekly",
        priority: 0.8,
    }));

    return [...staticPages, ...toolPages];
}