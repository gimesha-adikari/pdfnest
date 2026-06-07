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
        <Link href={href} className="group block">
            <div
                className="
          relative h-full overflow-hidden rounded-3xl
          border border-[color:var(--border)]
          bg-[var(--card)]
          p-6 shadow-lg transition-all duration-300
          hover:-translate-y-2 hover:shadow-2xl
        "
            >
                <div
                    className="
            absolute inset-0 opacity-0 transition
            bg-gradient-to-r from-indigo-500/0 via-purple-500/0 to-pink-500/0
            group-hover:opacity-100
          "
                />

                <div
                    className="
            flex h-14 w-14 items-center justify-center
            rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600
            text-xl font-bold text-white
          "
                >
                    PDF
                </div>

                <h3 className="mt-5 text-xl font-bold text-[var(--foreground)]">
                    {title}
                </h3>

                <p className="mt-3 text-sm text-[color:var(--muted)]">{description}</p>

                <div className="mt-6 flex items-center gap-2 font-semibold text-indigo-500">
                    Open Tool
                    <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                </div>
            </div>
        </Link>
    );
}