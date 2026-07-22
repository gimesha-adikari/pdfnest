import type { Metadata } from "next";
import { NAV_TOOLS } from "./toolsData";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfnest.gimesha.dev").replace(/\/$/, "");
const OG_IMAGE = `${BASE_URL}/platen-og.png`;

function buildAbsoluteUrl(pathname: string): string {
    return new URL(pathname.startsWith("/") ? pathname : `/${pathname}`, BASE_URL).toString();
}

function buildBaseMetadata(): Metadata {
    return {
        metadataBase: new URL(BASE_URL),
        title: {
            default: "Platen PDF - Free PDF Tools Online",
            template: "%s | Platen PDF",
        },
        description:
            "Merge, split, rotate, convert, compress, edit, and secure PDF documents directly in your browser.",
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
            canonical: BASE_URL,
        },
        openGraph: {
            title: "Platen PDF - Free PDF Tools Online",
            description:
                "Merge, split, rotate, convert, compress, edit, and secure PDF documents directly in your browser.",
            url: BASE_URL,
            siteName: "Platen PDF",
            locale: "en_US",
            type: "website",
            images: [
                {
                    url: OG_IMAGE,
                    width: 1200,
                    height: 630,
                    alt: "Platen PDF",
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: "Platen PDF - Free PDF Tools Online",
            description:
                "Merge, split, rotate, convert, compress, edit, and secure PDF documents directly in your browser.",
            images: [OG_IMAGE],
        },
        icons: {
            icon: "/favicon.ico",
            apple: "/apple-touch-icon.png",
        },
    };
}

export function getToolMetadata(toolHref: string): Metadata {
    const tool = NAV_TOOLS.find((item) => item.href === toolHref);

    if (!tool) {
        return buildBaseMetadata();
    }

    const title = tool.seoTitle ?? `${tool.title} Online Free - Platen PDF`;
    const description = tool.seoDescription ?? tool.description;

    const keywords = Array.from(
        new Set([
            tool.title,
            `${tool.title} online`,
            `${tool.title} free`,
            "Platen PDF",
            "free PDF tools",
            ...(tool.keywords ?? []),
        ])
    );

    const url = buildAbsoluteUrl(tool.href);

    return {
        metadataBase: new URL(BASE_URL),
        title,
        description,
        keywords,
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
        alternates: {
            canonical: url,
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
                    alt: title,
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