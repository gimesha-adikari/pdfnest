import Link from "next/link";
import type { ReactNode } from "react";
import { useTools } from "@/context/ToolContext";

type Category =
    | "all"
    | "organize"
    | "edit"
    | "convert"
    | "create"
    | "security"
    | "optimize"
    | "studio";

export function MobileLink({
                               href,
                               icon,
                               text,
                               close,
                           }: {
    href: string;
    icon: ReactNode;
    text: string;
    close: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={close}
            className="
        flex items-center gap-3 rounded-lg px-3 py-2
        text-xs font-medium text-[var(--muted)]
        transition-colors
        hover:bg-[var(--surface-hover)]
        hover:text-[var(--foreground)]
      "
        >
            {icon}
            <span className="truncate">{text}</span>
        </Link>
    );
}

export function ToolGroup({
                              title,
                              icon,
                              category,
                              close,
                          }: {
    title: string;
    icon: ReactNode;
    category: Category;
    close: () => void;
}) {
    const { displayTools: allTools } = useTools();
    const tools = allTools.filter((t) => (t.category || (t as any).Category) === category);

    return (
        <div className="mt-4">
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {icon}
                {title}
            </div>

            <div className="space-y-0.5">
                {tools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        onClick={close}
                        className="
              block rounded-md px-2.5 py-1.5 text-xs font-normal
              text-[var(--muted)]
              transition-colors
              hover:bg-[var(--surface-hover)]
              hover:text-[var(--foreground)]
            "
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{tool.title}</span>

                            {tool.isNew && (
                                <span className="
                  rounded bg-[var(--accent)]
                  px-1.5 py-0.2 font-mono text-[9px]
                  font-bold uppercase tracking-wider text-white
                ">
                  NEW
                </span>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
