import { getToolMetadata } from "@/lib/seo";
import ToolSEO from "@/components/SEO/ToolSEO";
import ToolFAQ from "@/components/SEO/ToolFAQ";

export const metadata = getToolMetadata("/powerpoint-to-pdf");

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <ToolSEO href="/powerpoint-to-pdf" />

            {children}

            <ToolFAQ toolHref="/powerpoint-to-pdf" />
        </>
    );
}
