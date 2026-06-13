import Link from "next/link";
import { NAV_TOOLS } from "@/lib/toolsData";

export default function Footer() {
    const editingTools = NAV_TOOLS.filter((t) => t.category === "editing");
    const convertTools = NAV_TOOLS.filter((t) => t.category === "convert");
    const securityTools = NAV_TOOLS.filter((t) => t.category === "security");

    return (
        <footer className="mt-auto border-t border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-md relative z-10">
            <div className="mx-auto max-w-7xl px-6 py-12">
                <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
                    <div className="space-y-3">
                        <h3 className="text-md font-black tracking-tight bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent select-none">
                            PDFNest Engine
                        </h3>
                        <p className="text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                            Files are processed inside secure, isolated execution environments. All structural data payloads are permanently wiped from sandbox tracks automatically immediately upon download completion.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold text-xs uppercase tracking-widest text-[color:var(--foreground)] mb-3">Structure Layers</h4>
                        <div className="flex flex-col gap-2 text-xs font-medium text-[color:var(--muted)]">
                            {editingTools.slice(0, 6).map((tool) => (
                                <Link
                                    key={tool.href}
                                    href={tool.href}
                                    className={`hover:text-indigo-500 transition-colors py-0.5 ${
                                        tool.isNew ? "font-bold text-indigo-500" : ""
                                    }`}
                                >
                                    {tool.title}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-xs uppercase tracking-widest text-[color:var(--foreground)] mb-3">Convert & Secure</h4>
                        <div className="flex flex-col gap-2 text-xs font-medium text-[color:var(--muted)]">
                            {convertTools.slice(0, 6).map((tool) => (
                                <Link
                                    key={tool.href}
                                    href={tool.href}
                                    className="hover:text-indigo-500 transition-colors py-0.5"
                                >
                                    {tool.title}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-xs uppercase tracking-widest text-[color:var(--foreground)] mb-3">Convert & Secure</h4>
                        <div className="flex flex-col gap-2 text-xs font-medium text-[color:var(--muted)]">
                            {securityTools.slice(0, 6).map((tool) => (
                                <Link
                                    key={tool.href}
                                    href={tool.href}
                                    className="hover:text-indigo-500 transition-colors py-0.5"
                                >
                                    {tool.title}
                                </Link>
                            ))}
                        </div>
                    </div>

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