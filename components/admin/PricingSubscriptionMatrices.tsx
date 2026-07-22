"use client";

import React from "react";

interface PricingSubscriptionMatricesProps {
    subData: Record<string, string>;
    setSubData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    formatLabel: (key: string) => string;
}

export default function PricingSubscriptionMatrices({
                                                        subData,
                                                        setSubData,
                                                        formatLabel,
                                                    }: PricingSubscriptionMatricesProps) {
    return (
        <div className="grid gap-4 p-6 text-[color:var(--foreground)]">
            {Object.keys(subData).map((key) => {
                const value = subData[key] || "";
                const isTextArea =
                    value.length > 65 ||
                    key.toLowerCase().includes("desc") ||
                    key.toLowerCase().includes("subtitle");

                return (
                    <div
                        key={key}
                        className="space-y-2.5 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-sm"
                    >
                        <label className="block text-xs font-bold text-[color:var(--foreground)]">
                            {formatLabel(key)}
                            <span className="mt-0.5 block font-mono text-[10px] text-[color:var(--muted-foreground)]">
                {key}
              </span>
                        </label>

                        {isTextArea ? (
                            <textarea
                                value={value}
                                onChange={(e) => setSubData({ ...subData, [key]: e.target.value })}
                                rows={3}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3 text-xs leading-relaxed text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                            />
                        ) : (
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => setSubData({ ...subData, [key]: e.target.value })}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3 text-xs font-medium text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}