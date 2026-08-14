import type { Metadata } from "next";
import { getToolBySlug } from "./server/tools";

const BASE_URL = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://platenpdf.com"
).replace(/\/$/, "");

function buildCanonicalUrl(baseUrl: string): string {
    const url = new URL(baseUrl);
    const hostname = url.hostname;
    const parts = hostname.split(".");

    const isApexDomain = parts.length === 2 && !hostname.startsWith("www.");

    if (isApexDomain) {
        url.hostname = `www.${hostname}`;
    }

    return url.toString().replace(/\/$/, "");
}

const CANONICAL_URL = buildCanonicalUrl(BASE_URL);
const OG_IMAGE = new URL("/platen-og.png", CANONICAL_URL).toString();

function buildAbsoluteUrl(pathname: string): string {
    return new URL(
        pathname.startsWith("/") ? pathname : `/${pathname}`,
        CANONICAL_URL
    ).toString();
}

function buildCommonMetadata(
    title: string,
    description: string,
    url: string,
    imageAlt: string
): Metadata {
    return {
        metadataBase: new URL(CANONICAL_URL),
        title,
        description,
        applicationName: "Platen PDF",
        category: "productivity",
        creator: "Platen",
        publisher: "Platen",
        referrer: "origin-when-cross-origin",
        formatDetection: {
            email: false,
            address: false,
            telephone: false,
        },
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                "max-image-preview": "large",
                "max-snippet": -1,
                "max-video-preview": -1,
            },
        },
        alternates: {
            canonical: url,
        },
        openGraph: {
            title,
            description,
            url,
            siteName: "Platen PDF",
            locale: "en_US",
            type: "website",
            images: [
                {
                    url: OG_IMAGE,
                    width: 1200,
                    height: 630,
                    alt: imageAlt,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [OG_IMAGE],
        },
        icons: {
            icon: "/favicon.ico",
            apple: "/apple-touch-icon.png",
        },
    };
}

function buildBaseMetadata(): Metadata {
    const title = "Platen PDF - Free PDF Tools Online";
    const description =
        "Merge, split, rotate, convert, compress, edit, and secure PDF documents directly in your browser.";

    return {
        ...buildCommonMetadata(title, description, CANONICAL_URL, "Platen PDF"),
        title: {
            default: title,
            template: "%s | Platen PDF",
        },
        keywords: [
            "PDF tools",
            "free PDF tools",
            "online PDF editor",
            "merge PDF",
            "split PDF",
            "rotate PDF",
            "compress PDF",
            "PDF to images",
            "images to PDF",
        ],
    };
}

export async function getToolMetadata(toolHref: string): Promise<Metadata> {
    const tool = await getToolBySlug(toolHref);

    if (!tool) {
        return buildBaseMetadata();
    }

    const toolTitle = tool.title || (tool as any).Title || "";
    const toolDescription = tool.description || (tool as any).Description || "";
    const toolHrefVal = tool.href || (tool as any).Href || toolHref;
    const seoTitle = tool.seoTitle || (tool as any).SeoTitle || `${toolTitle} Online Free - Platen PDF`;
    const seoDescription = tool.seoDescription || (tool as any).SeoDescription || toolDescription;

    let parsedKeywords: string[] = [];
    if (Array.isArray(tool.keywords)) {
        parsedKeywords = tool.keywords;
    } else if ((tool as any).KeywordsJson) {
        try {
            parsedKeywords = JSON.parse((tool as any).KeywordsJson);
        } catch {}
    }

    const keywords = Array.from(
        new Set([
            toolTitle,
            `${toolTitle} online`,
            `${toolTitle} free`,
            "Platen PDF",
            "free PDF tools",
            ...parsedKeywords,
        ])
    );

    const url = buildAbsoluteUrl(toolHrefVal);

    return {
        ...buildCommonMetadata(seoTitle, seoDescription, url, toolTitle),
        keywords,
    };
}