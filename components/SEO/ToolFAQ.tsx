"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { NAV_TOOLS } from "@/lib/toolsData";
import { fetchJson } from "@/lib/api";

interface FAQItem {
    question: string;
    answer: string;
}

interface BackendTool {
    // Structural case fallbacks for your DB properties
    Href?: string;
    href?: string;
    FaqJson?: string;
    faqJson?: string;
}

export default function ToolFAQ({
                                    toolHref
                                }: {
    toolHref: string;
}) {
    const [open, setOpen] = useState<number | null>(null);

    const localTool = NAV_TOOLS.find((t) => t.href === toolHref);
    const [faqList, setFaqList] = useState<FAQItem[]>(localTool?.faq || []);

    useEffect(() => {
        fetchJson("/site-content/tools")
            .then((data: unknown) => {
                if (Array.isArray(data) && data.length > 0) {
                    const tools = data as BackendTool[];
                    const found = tools.find((t) => (t.Href || t.href) === toolHref);

                    if (found) {
                        const rawJsonString = found.FaqJson || found.faqJson;

                        if (rawJsonString && typeof rawJsonString === "string" && rawJsonString.trim() !== "[]") {
                            try {
                                const parsedFaq = JSON.parse(rawJsonString);

                                if (Array.isArray(parsedFaq) && parsedFaq.length > 0) {
                                    const normalizedFaq: FAQItem[] = parsedFaq.map((item: any) => ({
                                        question: item.question || item.Question || item.q || "",
                                        answer: item.answer || item.Answer || item.a || ""
                                    })).filter(item => item.question && item.answer);

                                    if (normalizedFaq.length > 0) {
                                        setFaqList(normalizedFaq);
                                    }
                                }
                            } catch (parseError) {
                                console.error("Malformed FaqJson matrix configuration block text:", parseError);
                            }
                        }
                    }
                }
            })
            .catch((err) => {
                console.error("Error connecting to backend tools config service:", err);
            });
    }, [toolHref]);

    if (!faqList || faqList.length === 0) return null;

    return (
        <section className="mx-auto mt-16 mb-20 max-w-4xl px-4">
            <h2 className="text-3xl font-black mb-8 text-center text-[color:var(--foreground)]">
                Frequently Asked Questions
            </h2>
            <div className="space-y-3">
                {faqList.map((item, index) => (
                    <div
                        key={index}
                        className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] overflow-hidden transition-all"
                    >
                        <button
                            onClick={() => setOpen(open === index ? null : index)}
                            className="w-full flex items-center justify-between p-5 text-left font-bold text-[color:var(--foreground)] hover:bg-[color:var(--border)]/10"
                        >
                            <span>{item.question}</span>
                            <ChevronDown
                                className={`transition-transform duration-200 text-[color:var(--muted)] ${
                                    open === index ? "rotate-180" : ""
                                }`}
                            />
                        </button>
                        {open === index && (
                            <div className="px-5 pb-5 text-sm text-[color:var(--muted)] border-t border-[color:var(--border)]/40 pt-4 bg-[var(--background)]/20">
                                {item.answer}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}