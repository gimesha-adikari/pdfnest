"use client";

import React, { useState } from "react";
import { Info, Sparkles, Shield, Rocket, Plus, Trash2, Heart } from "lucide-react";

interface AboutPageContextsProps {
    aboutData: Record<string, string>;
    setAboutData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    formatLabel: (key: string) => string;
}

export default function AboutPageContexts({
                                              aboutData,
                                              setAboutData,
                                              formatLabel,
                                          }: AboutPageContextsProps) {
    const [newHighlightTitle, setNewHighlightTitle] = useState("");
    const [newHighlightDesc, setNewHighlightDesc] = useState("");
    const [arrayInputs, setArrayInputs] = useState<Record<string, string>>({});

    const safeParse = (jsonString: string) => {
        try {
            return jsonString ? JSON.parse(jsonString) : [];
        } catch {
            return [];
        }
    };

    const updateField = (key: string, value: string) => {
        setAboutData((prev) => ({ ...prev, [key]: value }));
    };

    const addHighlight = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newHighlightTitle.trim() || !newHighlightDesc.trim()) return;

        const current = safeParse(aboutData.HighlightsJson);
        const next = [...current, { title: newHighlightTitle.trim(), description: newHighlightDesc.trim() }];
        updateField("HighlightsJson", JSON.stringify(next));
        setNewHighlightTitle("");
        setNewHighlightDesc("");
    };

    const removeHighlight = (index: number) => {
        const current = safeParse(aboutData.HighlightsJson);
        const next = current.filter((_: any, i: number) => i !== index);
        updateField("HighlightsJson", JSON.stringify(next));
    };

    const addArrayItem = (key: string) => {
        const inputVal = arrayInputs[key] || "";
        if (!inputVal.trim()) return;

        const current = safeParse(aboutData[key]);
        const next = [...current, inputVal.trim()];
        updateField(key, JSON.stringify(next));
        setArrayInputs((prev) => ({ ...prev, [key]: "" }));
    };

    const removeArrayItem = (key: string, index: number) => {
        const current = safeParse(aboutData[key]);
        const next = current.filter((_: any, i: number) => i !== index);
        updateField(key, JSON.stringify(next));
    };

    const renderTextField = (key: string, label: string, isTextArea = false) => (
        <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[color:var(--muted-foreground)]">
                {label}
            </label>

            {isTextArea ? (
                <textarea
                    value={aboutData[key] || ""}
                    onChange={(e) => updateField(key, e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3 text-xs leading-relaxed text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                />
            ) : (
                <input
                    type="text"
                    value={aboutData[key] || ""}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                />
            )}
        </div>
    );

    return (
        <div className="space-y-6 p-6 text-[color:var(--foreground)]">
            {/* Hero Configurations */}
            <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
                <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                    <Sparkles size={12} /> Hero Section Identity
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {renderTextField("HeroTag", "Hero Tagline Badge")}
                    {renderTextField("HeroTitle", "Main Core Title Heading")}
                </div>
                {renderTextField("HeroDescription", "Hero Introduction Paragraph Statement", true)}
            </div>

            {/* Core Highlights Array Matrix */}
            <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
                <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                    <Info size={12} /> Dynamic Value Highlights
                </h4>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {renderTextField("SectionTitle", "Section Title Heading")}
                    {renderTextField("SectionSubtitle", "Section Subtitle Subtext Description")}
                </div>

                {/* Highlight Addition Grid Form */}
                <div className="space-y-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Add Platform Advantage Card
          </span>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input
                            type="text"
                            placeholder="Card Title (e.g., Ultra Fast)"
                            value={newHighlightTitle}
                            onChange={(e) => setNewHighlightTitle(e.target.value)}
                            className="rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                        />
                        <input
                            type="text"
                            placeholder="Short Description text..."
                            value={newHighlightDesc}
                            onChange={(e) => setNewHighlightDesc(e.target.value)}
                            className="rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={addHighlight}
                        disabled={!newHighlightTitle.trim() || !newHighlightDesc.trim()}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--primary)] py-2 text-xs font-bold text-white transition-all hover:brightness-105 disabled:opacity-40"
                    >
                        <Plus size={14} /> Insert Value Card
                    </button>
                </div>

                {/* Existing Highlights Grid */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {safeParse(aboutData.HighlightsJson).map((item: any, idx: number) => (
                        <div
                            key={idx}
                            className="group relative rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-4"
                        >
                            <button
                                type="button"
                                onClick={() => removeHighlight(idx)}
                                className="absolute right-2 top-2 text-[color:var(--muted-foreground)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                            >
                                <Trash2 size={13} />
                            </button>
                            <h5 className="text-xs font-bold text-[color:var(--foreground)]">{item.title}</h5>
                            <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--muted-foreground)]">
                                {item.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature Blocks: Studio & Canvas Split Grid Layout */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Studio Layer Card Container */}
                <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6">
                    <h4 className="border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                        Workspace Split A: Virtual Studio
                    </h4>

                    {renderTextField("StudioTitle", "Studio Title")}
                    {renderTextField("StudioDescription", "Studio Overview Summary", true)}

                    <div className="space-y-2 pt-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                            Studio Feature Highlights
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Add feature item..."
                                value={arrayInputs["StudioFeaturesJson"] || ""}
                                onChange={(e) =>
                                    setArrayInputs({ ...arrayInputs, StudioFeaturesJson: e.target.value })
                                }
                                className="flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => addArrayItem("StudioFeaturesJson")}
                                className="rounded-lg border border-[color:var(--border)] bg-[var(--card)] p-2 text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {safeParse(aboutData.StudioFeaturesJson).map((item: string, i: number) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-500/10 bg-blue-500/5 px-2.5 py-1 text-[11px] text-blue-500"
                                >
                  {item}
                                    <button
                                        type="button"
                                        onClick={() => removeArrayItem("StudioFeaturesJson", i)}
                                        className="hover:text-red-500"
                                    >
                    <Trash2 size={10} />
                  </button>
                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Interactive Canvas Configurations */}
                <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6">
                    <h4 className="border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                        Workspace Split B: Interactive Canvas
                    </h4>

                    {renderTextField("CanvasTitle", "Canvas Title")}
                    {renderTextField("CanvasDescription", "Canvas Overview Summary", true)}

                    <div className="space-y-2 pt-2">
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                            Canvas Feature Highlights
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Add canvas item..."
                                value={arrayInputs["CanvasFeaturesJson"] || ""}
                                onChange={(e) =>
                                    setArrayInputs({ ...arrayInputs, CanvasFeaturesJson: e.target.value })
                                }
                                className="flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => addArrayItem("CanvasFeaturesJson")}
                                className="rounded-lg border border-[color:var(--border)] bg-[var(--card)] p-2 text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {safeParse(aboutData.CanvasFeaturesJson).map((item: string, i: number) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/10 bg-amber-500/5 px-2.5 py-1 text-[11px] text-amber-500"
                                >
                  {item}
                                    <button
                                        type="button"
                                        onClick={() => removeArrayItem("CanvasFeaturesJson", i)}
                                        className="hover:text-red-500"
                                    >
                    <Trash2 size={10} />
                  </button>
                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Security Contexts Block */}
            <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
                <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                    <Shield size={12} /> Data Privacy & Operational Security
                </h4>
                {renderTextField("SecurityTitle", "Security Section Title Heading")}
                {renderTextField("SecurityDescription", "Security Policy Matrix Description Summary Statement", true)}
            </div>

            {/* Roadmap Metrics & Missions Container Split */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6">
                    <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                        <Rocket size={12} /> Technical Roadmap Matrix
                    </h4>

                    {renderTextField("RoadmapTitle", "Roadmap Container Heading Title")}

                    <div className="space-y-2 pt-1">
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                            Upcoming Target Items
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="e.g., AI Translation Layer"
                                value={arrayInputs["RoadmapJson"] || ""}
                                onChange={(e) => setArrayInputs({ ...arrayInputs, RoadmapJson: e.target.value })}
                                className="flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => addArrayItem("RoadmapJson")}
                                className="rounded-lg border border-[color:var(--border)] bg-[var(--card)] p-2 text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
                            {safeParse(aboutData.RoadmapJson).map((item: string, i: number) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between rounded-lg border border-sky-500/10 bg-sky-500/5 px-2.5 py-1.5 text-xs text-sky-500"
                                >
                                    <span className="truncate pr-2">🚀 {item}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeArrayItem("RoadmapJson", i)}
                                        className="hover:text-red-500"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6">
                    <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                        <Heart size={12} /> Strategic Intent & Platform Mission
                    </h4>

                    {renderTextField("MissionTitle", "Mission Header Title")}
                    {renderTextField("MissionDescription", "Mission Objective Context Description Statement", true)}
                </div>
            </div>
        </div>
    );
}