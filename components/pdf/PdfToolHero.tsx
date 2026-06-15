import React from "react";

interface PdfToolHeroProps {
    title: string;
    description: string;
    icon?: React.ReactNode;
}

export default function PdfToolHero({
                                        title,
                                        description,
                                        icon,
                                    }: PdfToolHeroProps) {
    return (
        <div className="text-center">
            {icon && (
                <div className="mb-4 flex justify-center">
                    {icon}
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