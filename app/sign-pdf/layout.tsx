import { getToolMetadata } from "@/lib/seo";
import ToolSEO from "@/components/SEO/ToolSEO";
import ToolFAQ from "@/components/SEO/ToolFAQ";

export const metadata = getToolMetadata("/sign-pdf");

export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <ToolSEO href="/sign-pdf" />

            {children}

            <ToolFAQ toolHref="/sign-pdf" />
        </>
    );
}
