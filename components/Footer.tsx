"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { NAV_TOOLS } from "@/lib/toolsData";
import { fetchJson } from "@/lib/api";

interface BackendTool {
    Title?: string;
    title?: string;
    Href?: string;
    href?: string;
    Category?: string;
    category?: string;
    IsNew?: boolean;
    isNew?: boolean;
}

export default function Footer() {
    const [toolsList, setToolsList] = useState<any[]>(NAV_TOOLS);

    useEffect(() => {
        fetchJson("/site-content/tools")
            .then((data: unknown) => {
                if (Array.isArray(data) && data.length > 0) {
                    setToolsList(data);
                } else {
                    setToolsList(NAV_TOOLS);
                }
            })
            .catch((err) => {
                console.error("Failed fetching footer components layout from backend matrix, falling back:", err);
                setToolsList(NAV_TOOLS);
            });
    }, []);

    const organizeTools = toolsList.filter((t: BackendTool) => (t.Category || t.category) === "organize");
    const editTools = toolsList.filter((t: BackendTool) => (t.Category || t.category) === "edit");
    const convertTools = toolsList.filter((t: BackendTool) => (t.Category || t.category) === "convert");
    const createTools = toolsList.filter((t: BackendTool) => (t.Category || t.category) === "create");
    const securityTools = toolsList.filter((t: BackendTool) => (t.Category || t.category) === "security");
    const optimizeTools = toolsList.filter((t: BackendTool) => (t.Category || t.category) === "optimize");
    const studioTools = toolsList.filter((t: BackendTool) => (t.Category || t.category) === "studio");

    return (
        <footer className="mt-auto border-t border-border bg-(--card)/50 backdrop-blur-md relative z-10">
            <div className="mx-auto max-w-7xl px-6 py-12">
                <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-5">
                    <div className="space-y-3">
                        <h3 className="text-md font-black tracking-tight bg-linear-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent select-none">
                            PDFNest Engine
                        </h3>
                        <p className="text-xs leading-relaxed text-muted font-medium">
                            Files are processed inside secure, isolated execution environments. All structural data payloads are permanently wiped from sandbox tracks automatically immediately upon download completion.
                        </p>
                        <Link
                            href="/privacy"
                            className="text-xs text-[color:var(--muted)] hover:text-indigo-500 transition-colors font-medium inline-block"
                        >
                            Privacy Policy
                        </Link>
                    </div>

                    {[
                        { title: "Organize", tools: organizeTools },
                        { title: "Edit", tools: editTools },
                        { title: "Convert", tools: convertTools },
                        { title: "Create", tools: createTools },
                        { title: "Security", tools: securityTools },
                        { title: "Optimize", tools: optimizeTools },
                        { title: "Studio", tools: studioTools },
                    ].map((group) => (
                        <div key={group.title}>
                            <h4 className="font-bold text-xs uppercase tracking-widest text-foreground mb-3">
                                {group.title}
                            </h4>

                            <div className="flex flex-col gap-2 text-xs font-medium text-muted">
                                {group.tools.slice(0, 6).map((tool: BackendTool, idx) => {
                                    const href = tool.Href || tool.href || "#";
                                    const title = tool.Title || tool.title || "";
                                    const isNew =
                                        tool.IsNew !== undefined ? tool.IsNew : tool.isNew;

                                    return (
                                        <Link
                                            key={href + idx}
                                            href={href}
                                            className={`hover:text-indigo-500 transition-colors py-0.5 ${
                                                isNew ? "font-bold text-indigo-500" : ""
                                            }`}
                                        >
                                            {title}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    <div>
                        <h4 className="font-bold text-xs uppercase tracking-widest text-[color:var(--foreground)] mb-3">Architecture Info</h4>
                        <div className="flex flex-col gap-2 text-xs font-medium text-[color:var(--muted)]">
                            <span className="flex items-center gap-1.5">No Costs or Licensing</span>
                            <span className="flex items-center gap-1.5">Isolated Security Run</span>
                            <span className="flex items-center gap-1.5">Privacy Compliant Proxy</span>

                            <Link
                                href="/about"
                                className="mt-2 hover:text-indigo-500 transition-colors text-[var(--foreground)] font-bold uppercase tracking-wide text-[10px]"
                            >
                                About PDFNest Setup →
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mt-12 border-t border-[color:var(--border)] pt-6 text-center text-xs font-medium text-[color:var(--muted)]">
                    © {new Date().getFullYear()} PDFNest Core Document Engine. All privileges reserved.
                </div>
            </div>
        </footer>
    );
}