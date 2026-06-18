"use client";
import {useState} from "react";
import {ChevronDown} from "lucide-react";
import {NAV_TOOLS} from "@/lib/toolsData";

export default function ToolFAQ({
                                    toolHref
                                }: {
    toolHref: string;
}) {
    const [open, setOpen] = useState<number | null>(null);
    const tool = NAV_TOOLS.find(
        (t) => t.href === toolHref
    );

    const faq = tool?.faq;

    if (!faq || faq.length === 0)
        return null;
    return (

        <section
            className="
            mx-auto
            mt-16
            mb-20
            max-w-4xl
        "
        >
            <h2
                className="
                text-3xl
                font-black
                mb-8
                text-center
            "
            >
                Frequently Asked Questions
            </h2>
            <div
                className="
                space-y-3
            "
            >
                {
                    faq.map((item, index) => (
                        <div
                            key={index}
                            className="
                            rounded-2xl
                            border
                            border-[color:var(--border)]
                            bg-[var(--card)]
                            overflow-hidden
                        "
                        >
                            <button
                                onClick={() =>
                                    setOpen(
                                        open === index
                                            ? null
                                            : index
                                    )
                                }
                                className="
                                w-full
                                flex
                                items-center
                                justify-between
                                p-5
                                text-left
                                font-bold
                            "
                            >
                                {item.question}
                                <ChevronDown
                                    className={`
                                    transition-transform
                                    ${
                                        open === index
                                            ? "rotate-180"
                                            : ""
                                    }
                                    `}
                                />

                            </button>
                            {
                                open === index && (
                                    <div
                                        className="
                                        px-5
                                        pb-5
                                        text-sm
                                        text-[color:var(--muted)]
                                    "
                                    >
                                        {item.answer}
                                    </div>
                                )
                            }
                        </div>
                    ))
                }
            </div>
        </section>
    );
}