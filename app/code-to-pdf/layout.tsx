import { getToolMetadata } from "@/lib/seo";
import ToolSEO from "@/components/SEO/ToolSEO";
import ToolFAQ from "@/components/SEO/ToolFAQ";

export const metadata = getToolMetadata("/code-to-pdf");

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <ToolSEO href="/code-to-pdf" />

            {children}

            <ToolFAQ toolHref="/code-to-pdf" />
        </>
    );
}
