"use client";

import React from "react";

interface LandingPageContextsProps {
    homeData: Record<string, string>;
    setHomeData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    formatLabel: (key: string) => string;
}

export default function LandingPageContexts({
                                                homeData,
                                                setHomeData,
                                                formatLabel,
                                            }: LandingPageContextsProps) {
    return (
        <div className="grid gap-4">
            {Object.keys(homeData).map((key) => {
                const isTextArea =
                    homeData[key].length > 65 ||
                    key.toLowerCase().includes("desc") ||
                    key.toLowerCase().includes("subtitle");

                return (
                    <div key={key} className="bg-[#11131e] border border-slate-800 rounded-2xl p-5 space-y-2.5 shadow-sm">
                        <label className="text-xs font-bold text-slate-300 block">
                            {formatLabel(key)}
                            <span className="block text-[10px] text-indigo-400/70 font-mono mt-0.5">{key}</span>
                        </label>
                        {isTextArea ? (
                            <textarea
                                value={homeData[key] || ""}
                                onChange={(e) => setHomeData({ ...homeData, [key]: e.target.value })}
                                rows={3}
                                className="w-full bg-[#090a0f] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:border-indigo-500 outline-none transition-colors leading-relaxed"
                            />
                        ) : (
                            <input
                                type="text"
                                value={homeData[key] || ""}
                                onChange={(e) => setHomeData({ ...homeData, [key]: e.target.value })}
                                className="w-full bg-[#090a0f] border border-slate-800 rounded-xl px-4 py-3 text-xs font-medium text-slate-200 focus:border-indigo-500 outline-none transition-colors"
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}