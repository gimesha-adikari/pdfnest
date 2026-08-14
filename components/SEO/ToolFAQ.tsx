"use client";
import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useTools } from "@/context/ToolContext";

interface FAQItem {
    question: string;
    answer: string;
}

export default function ToolFAQ({
    toolHref
}: {
    toolHref: string;
}) {
    const { getToolByHref } = useTools();
    const [open, setOpen] = useState<number | null>(null);

    const tool = getToolByHref(toolHref);

    const faqList: FAQItem[] = useMemo(() => {
        if (tool?.faq && Array.isArray(tool.faq) && tool.faq.length > 0) {
            return tool.faq;
        }
        const rawJsonString = (tool as any)?.FaqJson || (tool as any)?.faqJson;
        if (rawJsonString && typeof rawJsonString === "string" && rawJsonString.trim() !== "[]") {
            try {
                const parsed = JSON.parse(rawJsonString);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((item: any) => ({
                        question: item.question || item.Question || item.q || "",
                        answer: item.answer || item.Answer || item.a || ""
                    })).filter(item => item.question && item.answer);
                }
            } catch {}
        }
        return [];
    }, [tool]);

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
