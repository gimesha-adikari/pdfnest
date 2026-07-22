import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_TOOLS } from "@/lib/toolsData";

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
        flex items-center gap-3 rounded-xl px-3 py-3
        text-sm font-semibold text-[color:var(--foreground)]
        transition
        hover:bg-[color:var(--primary)]/10
        hover:text-[color:var(--primary)]
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
    const tools = NAV_TOOLS.filter((t) => t.category === category);

    return (
        <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[color:var(--muted-foreground)]">
                {icon}
                {title}
            </div>

            <div className="space-y-1">
                {tools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        onClick={close}
                        className="
              block rounded-xl px-3 py-2 text-sm font-medium
              text-[color:var(--foreground)]
              transition
              hover:bg-[color:var(--background)]
              hover:text-[color:var(--primary)]
            "
                    >
                        <div className="flex items-center justify-between gap-3">
                            <span className="truncate">{tool.title}</span>

                            {tool.isNew && (
                                <span className="
                  rounded-full bg-[color:var(--primary)]
                  px-2 py-0.5 text-[9px]
                  font-black uppercase tracking-wider text-white
                ">
                  New
                </span>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}