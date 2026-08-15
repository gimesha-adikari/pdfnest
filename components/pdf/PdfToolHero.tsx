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
                size={48}
                strokeWidth={1.5}
                className="text-[var(--primary)]"
            />
        );
    }

    return (
        <div className="text-center">
            {iconNode && (
                <div className="mb-4 flex justify-center">
                    {iconNode}
                </div>
            )}

            <h1 className="text-5xl font-black">{title}</h1>

            <p className="mt-4 text-lg text-muted">
                {description}
            </p>
        </div>
    );
}