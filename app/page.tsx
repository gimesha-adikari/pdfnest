"use client";
import { useState } from "react";
import ToolCard from "@/components/ToolCard";

export default function Home() {
    const [search, setSearch] =
        useState("");

    const tools = [
        {
            title: "Merge PDF",
            description: "Combine multiple PDF files into one.",
            href: "/merge-pdf",
        },
        {
            title: "Split PDF",
            description: "Extract pages from a PDF.",
            href: "/split-pdf",
        },
        {
            title: "Rotate PDF",
            description: "Rotate PDF pages easily.",
            href: "/rotate-pdf",
        },
        {
            title: "Images to PDF",
            description: "Convert images into PDF files.",
            href: "/images-to-pdf",
        },
        {
            title: "PDF to Images",
            description: "Convert PDF pages into JPG or PNG images.",
            href: "/pdf-to-images",
        },
        {
            title: "Delete Pages",
            description: "Remove specific pages from a PDF.",
            href: "/delete-pages",
        },
    ];

    const filteredTools =
        tools.filter((tool) => {
            const query =
                search.toLowerCase();

            return (
                tool.title
                    .toLowerCase()
                    .includes(query) ||
                tool.description
                    .toLowerCase()
                    .includes(query)
            );
        });

    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
            <div className="absolute inset-0 overflow-hidden -z-10">
                <div className="absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-indigo-500/20 blur-[120px]" />
                <div className="absolute top-20 right-0 h-[500px] w-[500px] rounded-full bg-pink-500/20 blur-[120px]" />
                <div className="absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full bg-cyan-500/20 blur-[120px]" />
            </div>

            <section className="mx-auto max-w-7xl px-6 py-10">

                <div className="mx-auto mt-20 max-w-3xl text-center">
          <span
              className="
              inline-flex rounded-full border border-indigo-200
              bg-indigo-50 px-4 py-1 text-sm font-medium text-indigo-700
            "
          >
            Free online PDF tools
          </span>

                    <h2 className="mt-6 text-6xl font-black tracking-tight sm:text-7xl">
                        Powerful
                        <span className="block bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              PDF Tools
            </span>
                    </h2>

                    <p className="mt-6 text-lg leading-8 text-[color:var(--muted)]">
                        Merge, split, rotate, and convert files in a clean browser-based experience.
                    </p>
                </div>

                <div className="mt-16 grid grid-cols-2 gap-6">
                    <div className="text-center">
                        <h3 className="text-3xl font-bold">100%</h3>
                        <p className="text-[color:var(--muted)]">Free</p>
                    </div>

                    <div className="text-center">
                        <h3 className="text-3xl font-bold">Fast</h3>
                        <p className="text-[color:var(--muted)]">Browser Based</p>
                    </div>
                </div>

                <div className="mx-auto mt-10 max-w-3xl">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4 shadow-sm">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) =>
                                setSearch(e.target.value)
                            }
                            placeholder="Search PDF tools..."
                            className="
        w-full
        rounded-xl
        border
        border-[color:var(--border)]
        bg-[var(--background)]
        text-[var(--foreground)]
        placeholder:text-[color:var(--muted)]
        px-4
        py-3
        text-sm
        outline-none
        focus:border-indigo-500
    "
                        />
                    </div>
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-[color:var(--muted)]">
                    <span className="rounded-full bg-slate-100 px-4 py-2">No sign-up</span>
                    <span className="rounded-full bg-slate-100 px-4 py-2">Fast processing</span>
                    <span className="rounded-full bg-slate-100 px-4 py-2">Privacy-friendly</span>
                    <span className="rounded-full bg-slate-100 px-4 py-2">Mobile-friendly</span>
                </div>

                <section id="tools" className="mt-20">
                    <div>
                        <h3 className="text-2xl font-bold tracking-tight">Popular tools</h3>
                        <p className="mt-2 text-[color:var(--muted)]">
                            Start with the most searched PDF actions.
                        </p>
                    </div>

                    <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {filteredTools.map((tool) => (
                            <ToolCard
                                key={tool.title}
                                title={tool.title}
                                description={tool.description}
                                href={tool.href}
                            />
                        ))}
                    </div>
                </section>
            </section>
        </main>
    );
}