import { NAV_TOOLS, type ToolCategory } from "@/lib/toolsData";

export const dynamic = "force-static";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://platenpdf.com").replace(/\/$/, "");

function toAbsoluteUrl(pathname: string): string {
    return new URL(pathname.startsWith("/") ? pathname : `/${pathname}`, BASE_URL).toString();
}

const CATEGORY_NAMES: Record<ToolCategory, string> = {
    organize: "Organize & Manage PDF",
    edit: "Edit & Annotate PDF",
    convert: "Convert Files & PDF",
    create: "Create PDF",
    security: "PDF Security & Protection",
    optimize: "Optimize & Compress PDF",
    studio: "PDF Studio & Advanced Tools",
};

export async function GET() {
    const lines: string[] = [];

    // H1 Title & Site Summary
    lines.push("# Platen PDF");
    lines.push("");
    lines.push(
        "Platen PDF is a privacy-first, online platform providing free tools to edit, convert, compress, merge, split, sign, and protect PDF documents directly in the browser."
    );
    lines.push("");

    // Group NAV_TOOLS dynamically by category
    const categoriesPresent = Array.from(new Set(NAV_TOOLS.map((t) => t.category)));

    categoriesPresent.forEach((categoryKey) => {
        const categoryTitle = CATEGORY_NAMES[categoryKey] ?? categoryKey;
        lines.push(`## ${categoryTitle}`);
        lines.push("");

        const toolsInCategory = NAV_TOOLS.filter((t) => t.category === categoryKey);
        toolsInCategory.forEach((tool) => {
            const absUrl = toAbsoluteUrl(tool.href);
            const desc = tool.description || tool.seoDescription || "";
            lines.push(`- [${tool.title}](${absUrl}): ${desc}`);
        });

        lines.push("");
    });

    // Site Information Section
    lines.push("## Site Information");
    lines.push("");
    lines.push(`- [Home](${toAbsoluteUrl("/")}): Main landing page for Platen PDF.`);
    lines.push(`- [All PDF Tools](${toAbsoluteUrl("/tools")}): Complete directory of all online PDF tools.`);
    lines.push(`- [About](${toAbsoluteUrl("/about")}): Learn about Platen PDF mission and infrastructure.`);
    lines.push(`- [Security](${toAbsoluteUrl("/security")}): Information on document privacy and security measures.`);
    lines.push(`- [Privacy Policy](${toAbsoluteUrl("/privacy")}): Terms regarding user data and privacy protection.`);
    lines.push(`- [Terms of Service](${toAbsoluteUrl("/terms")}): Terms and conditions for using Platen PDF.`);
    lines.push(`- [Contact](${toAbsoluteUrl("/contact")}): Get in touch with Platen PDF support.`);
    lines.push("");

    const content = lines.join("\n");

    return new Response(content, {
        status: 200,
        headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        },
    });
}
