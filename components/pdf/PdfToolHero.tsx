import React from "react";
import type { LucideProps } from "lucide-react";

interface PdfToolHeroProps {
    title: string;
    description: string;
    icon?: any;
}

export default function PdfToolHero({
                                        title,
                                        description,
                                        icon,
                                    }: PdfToolHeroProps) {
    let iconNode = null;

    if (icon) {
        try {
            iconNode = React.createElement(icon, {
                size: 48,
                strokeWidth: 1.5,
                className: "text-[var(--primary)]",
            });
        } catch {
            if (React.isValidElement(icon)) {
                iconNode = icon;
            }
        }
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