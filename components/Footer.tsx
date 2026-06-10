import Link from "next/link";
import { NAV_TOOLS } from "@/lib/toolsData";

export default function Footer() {
    const editingTools = NAV_TOOLS.filter((t) => t.category === "editing");
    const convertTools = NAV_TOOLS.filter((t) => t.category === "convert");

    return (
        <footer className="mt-auto border-t border-[color:var(--border)] bg-[var(--card)]">
            <div className="mx-auto max-w-7xl px-6 py-12">
                <div className="grid gap-10 md:grid-cols-4">
                    <div>
                        <h3 className="text-lg font-bold">PDFNest</h3>
                        <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                            Files are processed inside secure, isolated sandboxes. All documents are permanently deleted from our system automatically immediately after download.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-sm">Tools</h4>
                        <div className="mt-3 flex flex-col gap-2 text-sm">
                            {editingTools.map((tool) => (
                                <Link
                                    key={tool.href}
                                    href={tool.href}
                                    className={`hover:text-indigo-400 transition-colors ${
                                        tool.isNew ? "font-medium text-indigo-400/95" : ""
                                    }`}
                                >
                                    {tool.title}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold text-sm">Convert & Properties</h4>
                        <div className="mt-3 flex flex-col gap-2 text-sm">
                            {convertTools.map((tool) => (
                                <Link
                                    key={tool.href}
                                    href={tool.href}
                                    className="hover:text-indigo-400 transition-colors"
                                >
                                    {tool.title}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold text-sm">Information</h4>
                        <div className="mt-3 flex flex-col gap-2 text-sm text-[color:var(--muted)]">
                            <span>All tools are available at no cost.</span>
                            <span>No Sign-Up Required</span>
                            <span>Privacy Friendly</span>
                            <Link
                                href="/about"
                                className="mt-2 hover:text-indigo-400 transition-colors text-[var(--foreground)] font-medium"
                            >
                                About PDFNest
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mt-10 border-t border-[color:var(--border)] pt-6 text-center text-sm text-[color:var(--muted)]">
                    © {new Date().getFullYear()} PDFNest. All rights reserved.
                </div>
            </div>
        </footer>
    );
}