import React from "react";
import type { LucideProps } from "lucide-react";

type LucideIcon = React.FC<LucideProps>;

interface PdfToolHeroProps {
    title: string;
    description: string;
    icon?: LucideIcon | React.ReactNode;
}

export default function PdfToolHero({
                                        title,
                                        description,
                                        icon,
                                    }: PdfToolHeroProps) {
    // icon may arrive as a Lucide component constructor (from ClientToolLayout)
    // or as a ReactNode (legacy usage). Detect and render accordingly.
    const iconNode: React.ReactNode = (() => {
        if (!icon) return null;
        if (typeof icon === "function") {
            const Icon = icon as LucideIcon;
            return <Icon size={48} strokeWidth={1.5} className="text-[var(--primary)]" />;
        }
        return icon as React.ReactNode;
    })();

    return (
        <div className="text-center">
            {iconNode && (
                <div className="mb-4 flex justify-center">
                    {iconNode}
                </div>
            )}

            <h1 className="text-5xl font-black">
                {title}
            </h1>

            <p className="mt-4 text-lg text-muted">
                {description}
            </p>
        </div>
    );
}