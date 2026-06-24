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

    // Specialized Object Array Manager for Highlights [{title, description}]
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

    // Flat String Array Managers for Features & Roadmap
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
            <label className="text-xs text-slate-400 font-medium">{label}</label>
            {isTextArea ? (
                <textarea
                    value={aboutData[key] || ""}
                    onChange={(e) => updateField(key, e.target.value)}
                    rows={3}
                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors leading-relaxed"
                />
            ) : (
                <input
                    type="text"
                    value={aboutData[key] || ""}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                />
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Hero Configurations */}
            <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                    <Sparkles size={12} /> Hero Section Identity
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderTextField("HeroTag", "Hero Tagline Badge")}
                    {renderTextField("HeroTitle", "Main Core Title Heading")}
                </div>
                {renderTextField("HeroDescription", "Hero Introduction Paragraph Statement", true)}
            </div>

            {/* Core Highlights Array Matrix */}
            <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                    <Info size={12} /> Dynamic Value Highlights
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderTextField("SectionTitle", "Section Title Heading")}
                    {renderTextField("SectionSubtitle", "Section Subtitle Subtext Description")}
                </div>

                {/* Highlight Addition Grid Form */}
                <div className="bg-[#090a0f] p-4 border border-slate-800 rounded-xl space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Add Platform Advantage Card</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Card Title (e.g., Ultra Fast)"
                            value={newHighlightTitle}
                            onChange={(e) => setNewHighlightTitle(e.target.value)}
                            className="bg-[#11131e] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                        />
                        <input
                            type="text"
                            placeholder="Short Description text..."
                            value={newHighlightDesc}
                            onChange={(e) => setNewHighlightDesc(e.target.value)}
                            className="bg-[#11131e] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={addHighlight}
                        disabled={!newHighlightTitle.trim() || !newHighlightDesc.trim()}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-bold text-xs text-white rounded-lg transition-all inline-flex items-center justify-center gap-1"
                    >
                        <Plus size={14} /> Insert Value Card
                    </button>
                </div>

                {/* Existing Highlights Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {safeParse(aboutData.HighlightsJson).map((item: any, idx: number) => (
                        <div key={idx} className="bg-[#090a0f] border border-slate-800 p-4 rounded-xl relative group">
                            <button
                                type="button"
                                onClick={() => removeHighlight(idx)}
                                className="absolute top-2 right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 size={13} />
                            </button>
                            <h5 className="text-xs font-bold text-slate-200">{item.title}</h5>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Feature Blocks: Studio & Canvas Split Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Studio Layer Card Container */}
                <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 pb-2 border-b border-slate-800">
                        Workspace Split A: Virtual Studio
                    </h4>
                    {renderTextField("StudioTitle", "Studio Title")}
                    {renderTextField("StudioDescription", "Studio Overview Summary", true)}

                    <div className="space-y-2 pt-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">Studio Feature Highlights</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Add feature item..."
                                value={arrayInputs["StudioFeaturesJson"] || ""}
                                onChange={(e) => setArrayInputs({ ...arrayInputs, StudioFeaturesJson: e.target.value })}
                                className="flex-1 bg-[#090a0f] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
                            />
                            <button type="button" onClick={() => addArrayItem("StudioFeaturesJson")} className="p-2 bg-slate-800 rounded-lg text-white hover:bg-slate-700"><Plus size={14} /></button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {safeParse(aboutData.StudioFeaturesJson).map((item: string, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 bg-blue-500/5 text-blue-400 text-[11px] px-2.5 py-1 rounded-md border border-blue-500/10">
                  {item}
                                    <button type="button" onClick={() => removeArrayItem("StudioFeaturesJson", i)} className="hover:text-red-400"><Trash2 size={10} /></button>
                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Interactive Canvas Configurations */}
                <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 pb-2 border-b border-slate-800">
                        Workspace Split B: Interactive Canvas
                    </h4>
                    {renderTextField("CanvasTitle", "Canvas Title")}
                    {renderTextField("CanvasDescription", "Canvas Overview Summary", true)}

                    <div className="space-y-2 pt-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">Canvas Feature Highlights</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Add canvas item..."
                                value={arrayInputs["CanvasFeaturesJson"] || ""}
                                onChange={(e) => setArrayInputs({ ...arrayInputs, CanvasFeaturesJson: e.target.value })}
                                className="flex-1 bg-[#090a0f] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
                            />
                            <button type="button" onClick={() => addArrayItem("CanvasFeaturesJson")} className="p-2 bg-slate-800 rounded-lg text-white hover:bg-slate-700"><Plus size={14} /></button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {safeParse(aboutData.CanvasFeaturesJson).map((item: string, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 bg-amber-500/5 text-amber-400 text-[11px] px-2.5 py-1 rounded-md border border-amber-500/10">
                  {item}
                                    <button type="button" onClick={() => removeArrayItem("CanvasFeaturesJson", i)} className="hover:text-red-400"><Trash2 size={10} /></button>
                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Security Contexts Block */}
            <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                    <Shield size={12} /> Data Privacy & Operational Security
                </h4>
                {renderTextField("SecurityTitle", "Security Section Title Heading")}
                {renderTextField("SecurityDescription", "Security Policy Matrix Description Summary Statement", true)}
            </div>

            {/* Roadmap Metrics & Missions Container Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                        <Rocket size={12} /> Technical Roadmap Matrix
                    </h4>
                    {renderTextField("RoadmapTitle", "Roadmap Container Heading Title")}
                    <div className="space-y-2 pt-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">Upcoming Target Items</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="e.g., AI Translation Layer"
                                value={arrayInputs["RoadmapJson"] || ""}
                                onChange={(e) => setArrayInputs({ ...arrayInputs, RoadmapJson: e.target.value })}
                                className="flex-1 bg-[#090a0f] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
                            />
                            <button type="button" onClick={() => addArrayItem("RoadmapJson")} className="p-2 bg-slate-800 rounded-lg text-white hover:bg-slate-700"><Plus size={14} /></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {safeParse(aboutData.RoadmapJson).map((item: string, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-sky-500/5 text-sky-400 text-xs px-2.5 py-1.5 rounded-lg border border-sky-500/10">
                                    <span className="truncate pr-2">🚀 {item}</span>
                                    <button type="button" onClick={() => removeArrayItem("RoadmapJson", i)} className="hover:text-red-400"><Trash2 size={12} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-pink-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                        <Heart size={12} /> Strategic Intent & Platform Mission
                    </h4>
                    {renderTextField("MissionTitle", "Mission Header Title Title")}
                    {renderTextField("MissionDescription", "Mission Objective Context Description Statement", true)}
                </div>
            </div>
        </div>
    );
}