import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
            <div className="relative h-full overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-md transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-indigo-500/30 group-hover:shadow-2xl group-focus-visible:ring-2 group-focus-visible:ring-indigo-500/50 flex flex-col justify-between">
                {/* Visual Accent Hover Overlay Gradient Ring */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.02] dark:group-hover:opacity-[0.04] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 transition-opacity duration-300 pointer-events-none" />

                <div>
                    {/* Graphic Dynamic Floating Indicator Tag Icon Badge */}
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] font-black tracking-wider text-white shadow-sm select-none">
                        PDF
                    </div>

                    <h3 className="mt-5 text-lg font-extrabold text-[var(--foreground)] tracking-tight group-hover:text-indigo-500 transition-colors duration-200">
                        {title}
                    </h3>

                    <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                        {description}
                    </p>
                </div>

                <div className="mt-6 flex items-center gap-1 text-xs font-bold text-indigo-500 tracking-wide uppercase group-hover:text-indigo-600 transition-colors">
                    Open Tool Module
                    <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
                </div>
            </div>
        </Link>
    );
}