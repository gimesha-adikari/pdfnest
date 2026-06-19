import { getToolMetadata } from "@/lib/seo";
import ToolSEO from "@/components/SEO/ToolSEO";
import ToolFAQ from "@/components/SEO/ToolFAQ";

export const metadata = getToolMetadata("/pdf-to-powerpoint");

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <ToolSEO href="/pdf-to-powerpoint" />

            {children}

            <ToolFAQ toolHref="/pdf-to-powerpoint" />
        </>
    );
}
