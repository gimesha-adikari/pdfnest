"use client";

import { ShieldCheck } from "lucide-react";

interface MarkupSuccessBannerProps {
    title: string;
    description: string;
    className?: string;
}

export default function MarkupSuccessBanner({ title, description, className = "" }: MarkupSuccessBannerProps) {
    return (
        <div
            className={`flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 ${className}`}
        >
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
            <div className="text-xs">
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">{description}</p>
            </div>
        </div>
    );
}
