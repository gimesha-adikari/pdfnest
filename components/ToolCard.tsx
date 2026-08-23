import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";

interface ToolCardProps {
    title: string;
    description: string;
    href: string;
}

export default function ToolCard({
                                     title,
                                     description,
                                     href,
                                 }: ToolCardProps) {
    return (
        <Link href={href} className="group block h-full outline-none">
            <div className="relative h-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-5 transition-all duration-200 hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] flex flex-col justify-between focus-visible:ring-2 focus-visible:ring-[var(--accent)] shadow-sm">
                <div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--accent)] transition-colors group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent-subtle)]">
                        <Layers size={16} />
                    </div>

                    <h3 className="mt-4 text-sm font-semibold text-[var(--foreground)] tracking-tight group-hover:text-[var(--accent)] transition-colors duration-150">
                        {title}
                    </h3>

                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)] line-clamp-2">
                        {description}
                    </p>
                </div>

                <div className="mt-5 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-muted)] group-hover:text-[var(--foreground)] transition-colors">
                    <span>Open Module</span>
                    <ArrowRight size={12} className="transition-transform duration-150 group-hover:translate-x-1" />
                </div>
            </div>
        </Link>
    );
}
