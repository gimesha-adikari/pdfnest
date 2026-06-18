import { Metadata } from "next";
import { NAV_TOOLS } from "./toolsData";

const BASE_URL =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://pdfnest.com";
export function getToolMetadata(
    toolHref: string
): Metadata {

    const tool =
        NAV_TOOLS.find(
            (item) =>
                item.href === toolHref
        );

    if (!tool) {

        return {
            title:
                "PDF Tools Online Free | PDFNest",
            description:
                "Free online PDF tools to merge, edit, convert, compress and secure PDF documents.",
            robots:{
                index:true,
                follow:true
            }
        };
    }

    const keywords = Array.from(
        new Set(
            [
                tool.title,
                `${tool.title} online`,
                `${tool.title} free`,
                "PDFNest",
                "free PDF tools",
                ...(tool.keywords ?? [])
            ]
        )
    );

    const title =
        tool.seoTitle ??
        `${tool.title} Online Free - PDFNest`;

    const description =
        tool.seoDescription ??
        tool.description;

    const url =
        `${BASE_URL}${tool.href}`;

    return {
        title,
        description,
        keywords,
        authors:[
            {
                name:"PDFNest"
            }
        ],
        creator:"PDFNest",
        publisher:"PDFNest",
        alternates:{
            canonical:url
        },

        robots:{
            index:true,
            follow:true,
            googleBot:{
                index:true,
                follow:true,
                "max-image-preview":"large",
                "max-snippet":-1,
                "max-video-preview":-1
            }
        },

        openGraph:{
            title,
            description,
            url,
            siteName:
                "PDFNest",
            locale:
                "en_US",
            type:
                "website",
            images:[
                {
                    url:
                        `${BASE_URL}/pdfnest-og.png`,
                    width:
                        1200,
                    height:
                        630,
                    alt:
                    title
                }
            ]
        },

        twitter:{
            card:
                "summary_large_image",
            title,
            description,
            images:[
                `${BASE_URL}/pdfnest-og.png`
            ]
        }
    };
}