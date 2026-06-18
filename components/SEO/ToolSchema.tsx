import { NAV_TOOLS } from "@/lib/toolsData";

export default function ToolSchema({
                                       toolHref,
                                   }: {
    toolHref: string;
}) {

    const tool = NAV_TOOLS.find(
        (t) => t.href === toolHref
    );

    if (!tool) return null;


    const schema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",

        name: `${tool.title} - PDFNest`,

        applicationCategory:
            "DocumentManagementApplication",

        operatingSystem:
            "Web",

        description:
        tool.description,

        url:
            `https://yourdomain.com${tool.href}`,

        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD"
        },


        featureList:
            tool.features || [
                tool.title,
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
                __html:
                    JSON.stringify(schema)
            }}
        />
    );
}