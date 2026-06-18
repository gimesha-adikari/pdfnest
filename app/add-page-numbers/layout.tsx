import { getToolMetadata } from "@/lib/seo";
import ToolSEO from "@/components/SEO/ToolSEO";
import ToolFAQ from "@/components/SEO/ToolFAQ";

export const metadata = getToolMetadata("/add-page-numbers");

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <ToolSEO href="/add-page-numbers" />

            {children}

            <ToolFAQ toolHref="/add-page-numbers" />
        </>
    );
}
