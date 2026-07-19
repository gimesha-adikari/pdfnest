import type { MetadataRoute } from "next";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfnest.gimesha.dev").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/_next/",
                    "/api/",
                    "/dashboard/",
                ],
            },
        ],
        sitemap: `${BASE_URL}/sitemap.xml`,
        host: BASE_URL,
    };
}