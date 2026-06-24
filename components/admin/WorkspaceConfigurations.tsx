"use client";

import React, { useState } from "react";
import {
    LayoutGrid, Sparkles, SlidersHorizontal, Eye, Hash, Link2, CheckCircle2,
    HelpCircle, Plus, Trash2
} from "lucide-react";

interface FAQItem {
    question: string;
    answer: string;
}

interface WorkspaceConfigurationsProps {
    toolsList: any[];
    selectedToolHref: string;
    setSelectedToolHref: (href: string) => void;
    updateCurrentToolField: (fieldKey: string, newValue: any) => void;
}

export default function WorkspaceConfigurations({
                                                    toolsList,
                                                    selectedToolHref,
                                                    setSelectedToolHref,
                                                    updateCurrentToolField,
                                                }: WorkspaceConfigurationsProps) {
    const currentActiveTool = toolsList.find(t => (t.Href || t.href) === selectedToolHref);

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Column Sidebar Selection */}
            <div className="md:col-span-4 bg-[#11131e] border border-slate-800 rounded-2xl p-4 space-y-1.5 max-h-[75vh] overflow-y-auto shadow-md">
                <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase px-2 block mb-2">Active Modules</span>
                {toolsList.map((tool) => {
                    const toolHref = tool.Href || tool.href;
                    const isSelected = toolHref === selectedToolHref;
                    return (
                        <button
                            key={toolHref}
                            onClick={() => setSelectedToolHref(toolHref)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all ${isSelected ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" : "text-slate-400 hover:text-slate-200 hover:bg-[#090a0f]"}`}
                        >
                            <span className="truncate pr-2">{tool.Title || tool.title}</span>
                            <LayoutGrid size={13} className={isSelected ? "opacity-100" : "opacity-40"} />
                        </button>
                    );
                })}
            </div>

            {/* Right Content Editor Panel */}
            {currentActiveTool && (
                <div className="md:col-span-8 space-y-5">
                    {/* Info Track Header Banner */}
                    <div className="bg-[#121625] border border-indigo-500/20 p-4 rounded-2xl flex items-center gap-3 shadow-inner">
                        <Sparkles size={18} className="text-indigo-400 animate-pulse" />
                        <div>
                            <h3 className="text-sm font-bold text-indigo-300">Workspace Layer: {currentActiveTool.Title}</h3>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedToolHref}</p>
                        </div>
                    </div>

                    {/* Core Metadata Section */}
                    <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                            <SlidersHorizontal size={12} /> Standard Parameters
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium">Display Name Title</label>
                                <input
                                    type="text"
                                    value={currentActiveTool.Title || ""}
                                    onChange={(e) => updateCurrentToolField("Title", e.target.value)}
                                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium">Route Category Grouping</label>
                                <select
                                    value={currentActiveTool.Category || ""}
                                    onChange={(e) => updateCurrentToolField("Category", e.target.value)}
                                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                >
                                    <option value="editing">Editing</option>
                                    <option value="convert">Convert</option>
                                    <option value="security">Security</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs text-slate-400 font-medium">Global Tool Hero Description Summary</label>
                            <textarea
                                value={currentActiveTool.Description || ""}
                                onChange={(e) => updateCurrentToolField("Description", e.target.value)}
                                rows={2}
                                className="w-full bg-[#090a0f] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors leading-relaxed"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium">Mime Filter Type Limits</label>
                                <input
                                    type="text"
                                    value={currentActiveTool.Accept || ""}
                                    placeholder=".pdf, .docx, image/*"
                                    onChange={(e) => updateCurrentToolField("Accept", e.target.value)}
                                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors font-mono"
                                />
                            </div>
                            <div className="flex gap-6 items-center h-full pt-6 pl-1">
                                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-slate-300 select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!currentActiveTool.Multiple}
                                        onChange={(e) => updateCurrentToolField("Multiple", e.target.checked)}
                                        className="w-4 h-4 rounded bg-[#090a0f] border-slate-800 text-indigo-600 focus:ring-0"
                                    />
                                    Allow Batch File Queues
                                </label>
                                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-slate-300 select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!currentActiveTool.IsNew}
                                        onChange={(e) => updateCurrentToolField("IsNew", e.target.checked)}
                                        className="w-4 h-4 rounded bg-[#090a0f] border-slate-800 text-indigo-600 focus:ring-0"
                                    />
                                    Highlight Badge as "New"
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* SEO Metadata Block */}
                    <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                            <Eye size={13} /> Target Search Engine Metadata Optimization
                        </h4>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium">Custom SEO Title Header</label>
                                <input
                                    type="text"
                                    value={currentActiveTool.SeoTitle || ""}
                                    placeholder="Title text indexing value override"
                                    onChange={(e) => updateCurrentToolField("SeoTitle", e.target.value)}
                                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium">Custom SEO Description Summary Snippet</label>
                                <textarea
                                    value={currentActiveTool.SeoDescription || ""}
                                    onChange={(e) => updateCurrentToolField("SeoDescription", e.target.value)}
                                    rows={2}
                                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-400 font-medium">Search Intent / Core Statement Objective</label>
                                <input
                                    type="text"
                                    value={currentActiveTool.Intent || ""}
                                    onChange={(e) => updateCurrentToolField("Intent", e.target.value)}
                                    className="w-full bg-[#090a0f] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Array Content Managers */}
                    <ArrayBadgeManager
                        title="Search Index Keywords"
                        icon={<Hash size={13} />}
                        fieldKey="KeywordsJson"
                        colorClass="text-emerald-400 bg-emerald-500/5 border-emerald-500/10"
                        jsonValue={currentActiveTool.KeywordsJson}
                        onChange={(newValue) => updateCurrentToolField("KeywordsJson", newValue)}
                    />

                    <ArrayBadgeManager
                        title="Inter-Connected Recommended Links"
                        icon={<Link2 size={13} />}
                        fieldKey="RelatedJson"
                        placeholder="/split-pdf"
                        colorClass="text-blue-400 bg-blue-500/5 border-blue-500/10"
                        jsonValue={currentActiveTool.RelatedJson}
                        onChange={(newValue) => updateCurrentToolField("RelatedJson", newValue)}
                    />

                    <ArrayBadgeManager
                        title="Core Feature Advantages Highlights"
                        icon={<CheckCircle2 size={13} />}
                        fieldKey="FeaturesJson"
                        colorClass="text-amber-400 bg-amber-500/5 border-amber-500/10"
                        jsonValue={currentActiveTool.FeaturesJson}
                        onChange={(newValue) => updateCurrentToolField("FeaturesJson", newValue)}
                    />

                    {/* FAQ Interface Builder Block */}
                    <FaqSectionBuilder
                        jsonValue={currentActiveTool.FaqJson}
                        onChange={(newValue) => updateCurrentToolField("FaqJson", newValue)}
                    />
                </div>
            )}
        </div>
    );
}

/* ==========================================================================
   SUB-COMPONENT: ARRAY BADGE MANAGER
   ========================================================================== */
interface BadgeManagerProps {
    title: string;
    icon: React.ReactNode;
    fieldKey: string;
    placeholder?: string;
    colorClass: string;
    jsonValue: string;
    onChange: (val: string) => void;
}

function ArrayBadgeManager({ title, icon, placeholder = "Enter value...", colorClass, jsonValue, onChange }: BadgeManagerProps) {
    const [inputValue, setInputValue] = useState("");
    const items = jsonValue ? JSON.parse(jsonValue) : [];

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        if (items.includes(inputValue.trim())) return;

        const nextItems = [...items, inputValue.trim()];
        onChange(JSON.stringify(nextItems));
        setInputValue("");
    };

    const handleRemoveItem = (targetIndex: number) => {
        const nextItems = items.filter((_: any, i: number) => i !== targetIndex);
        onChange(JSON.stringify(nextItems));
    };

    return (
        <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
            <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-800 ${colorClass.split(" ")[0]}`}>
                {icon} {title}
            </h4>

            <form onSubmit={handleAddItem} className="flex gap-2">
                <input
                    type="text"
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="flex-1 bg-[#090a0f] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                    type="submit"
                    className="px-4 bg-[#1b1e2f] border border-slate-800 text-slate-200 rounded-xl text-xs font-bold hover:bg-[#23273f] transition-colors inline-flex items-center gap-1"
                >
                    <Plus size={14} /> Insert
                </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-1">
                {items.length === 0 ? (
                    <span className="text-xs text-slate-500 italic font-medium pl-1">No metadata array elements attached.</span>
                ) : (
                    items.map((val: string, index: number) => (
                        <div
                            key={val + index}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${colorClass}`}
                        >
                            <span>{val}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="opacity-60 hover:opacity-100 hover:text-red-400 transition-all ml-0.5"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

/* ==========================================================================
   SUB-COMPONENT: FAQ BUILDER
   ========================================================================== */
interface FaqBuilderProps {
    jsonValue: string;
    onChange: (val: string) => void;
}

function FaqSectionBuilder({ jsonValue, onChange }: FaqBuilderProps) {
    const faqs: FAQItem[] = jsonValue ? JSON.parse(jsonValue) : [];
    const [newQuestion, setNewQuestion] = useState("");
    const [newAnswer, setNewAnswer] = useState("");

    const handleAddNewFaq = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newQuestion.trim() || !newAnswer.trim()) return;

        const nextFaqs = [...faqs, { question: newQuestion.trim(), answer: newAnswer.trim() }];
        onChange(JSON.stringify(nextFaqs));

        setNewQuestion("");
        setNewAnswer("");
    };

    const handleRemoveFaq = (targetIndex: number) => {
        const nextFaqs = faqs.filter((_, i) => i !== targetIndex);
        onChange(JSON.stringify(nextFaqs));
    };

    return (
        <div className="bg-[#11131e] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 pb-2 border-b border-slate-800">
                <HelpCircle size={13} /> Interactive FAQ List Builder
            </h4>

            <div className="space-y-3">
                {faqs.length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-3 text-center border border-dashed border-slate-800 rounded-xl bg-[#090a0f]/40">
                        No frequently asked questions stored for this tool module.
                    </div>
                ) : (
                    faqs.map((faq, index) => (
                        <div key={index} className="bg-[#090a0f] border border-slate-800 rounded-xl p-4 relative group shadow-sm space-y-1">
                            <button
                                type="button"
                                onClick={() => handleRemoveFaq(index)}
                                className="absolute top-4 right-4 text-slate-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/5 transition-all md:opacity-0 group-hover:opacity-100"
                                title="Delete FAQ Row"
                            >
                                <Trash2 size={14} />
                            </button>
                            <h5 className="text-xs font-bold text-slate-200 pr-6 flex gap-1.5">
                                <span className="text-indigo-400 font-mono">Q:</span> {faq.question}
                            </h5>
                            <p className="text-xs text-slate-400 leading-relaxed pt-1 flex gap-1.5">
                                <span className="text-emerald-400 font-mono">A:</span> {faq.answer}
                            </p>
                        </div>
                    ))
                )}
            </div>

            <form onSubmit={handleAddNewFaq} className="bg-[#090a0f] p-4 border border-slate-800 rounded-xl space-y-3 pt-3 mt-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Add New FAQ Accordion Row</span>
                <div className="space-y-2">
                    <input
                        type="text"
                        value={newQuestion}
                        placeholder="Question title (e.g., Is it free?)"
                        onChange={(e) => setNewQuestion(e.target.value)}
                        className="w-full bg-[#11131e] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                    />
                    <textarea
                        value={newAnswer}
                        placeholder="Answer statement copy context..."
                        onChange={(e) => setNewAnswer(e.target.value)}
                        rows={2}
                        className="w-full bg-[#11131e] border border-slate-800 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors leading-relaxed"
                    />
                </div>
                <button
                    type="submit"
                    disabled={!newQuestion.trim() || !newAnswer.trim()}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-bold text-xs text-white rounded-lg transition-all shadow-md shadow-indigo-600/5 inline-flex items-center justify-center gap-1"
                >
                    <Plus size={14} /> Append Question Row
                </button>
            </form>
        </div>
    );
}