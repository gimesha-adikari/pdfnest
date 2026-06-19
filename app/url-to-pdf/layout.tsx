import { getToolMetadata } from "@/lib/seo";
import ToolSEO from "@/components/SEO/ToolSEO";
import ToolFAQ from "@/components/SEO/ToolFAQ";

export const metadata = getToolMetadata("/url-to-pdf");

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <ToolSEO href="/url-to-pdf" />

            {children}

            <ToolFAQ toolHref="/url-to-pdf" />
        </>
    );
}
