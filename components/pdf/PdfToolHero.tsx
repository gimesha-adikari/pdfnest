import React from "react";
import type { LucideProps } from "lucide-react";

type LucideIcon = React.ComponentType<LucideProps>;

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
    let iconNode: React.ReactNode = null;

    if (!icon) {
        iconNode = null;
    } else if (React.isValidElement(icon)) {
        iconNode = icon;
    } else {
        const IconComponent = icon as LucideIcon;
        iconNode = (
            <IconComponent
                size={24}
                strokeWidth={1.75}
                className="text-[var(--primary)]"
            />
        );
    }

    return (
        <div className="text-center max-w-2xl mx-auto mb-8">
            {iconNode && (
                <div className="mb-4 flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--accent)] shadow-sm">
                        {iconNode}
                    </div>
                </div>
            )}

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--foreground)]">{title}</h1>

            <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
                {description}
            </p>
        </div>
    );
}