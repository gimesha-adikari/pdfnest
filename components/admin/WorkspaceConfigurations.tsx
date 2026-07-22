"use client";

import React, { useState } from "react";
import {
    LayoutGrid,
    Sparkles,
    SlidersHorizontal,
    Eye,
    Hash,
    Link2,
    CheckCircle2,
    HelpCircle,
    Plus,
    Trash2,
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

function safeParseArray<T = any>(value: string | undefined, fallback: T[] = []): T[] {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

export default function WorkspaceConfigurations({
                                                    toolsList,
                                                    selectedToolHref,
                                                    setSelectedToolHref,
                                                    updateCurrentToolField,
                                                }: WorkspaceConfigurationsProps) {
    const currentActiveTool = toolsList.find((t) => (t.Href || t.href) === selectedToolHref);

    return (
        <div className="grid grid-cols-1 items-start gap-6 p-6 md:grid-cols-12 text-[color:var(--foreground)]">
            {/* Left Column Sidebar Selection */}
            <div className="max-h-[75vh] space-y-1.5 overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4 shadow-md md:col-span-4">
        <span className="mb-2 block px-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--muted-foreground)]">
          Active Modules
        </span>

                {toolsList.map((tool) => {
                    const toolHref = tool.Href || tool.href;
                    const isSelected = toolHref === selectedToolHref;

                    return (
                        <button
                            key={toolHref}
                            onClick={() => setSelectedToolHref(toolHref)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all ${
                                isSelected
                                    ? "bg-[var(--primary)] text-white shadow-md"
                                    : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--background)] hover:text-[color:var(--foreground)]"
                            }`}
                        >
                            <span className="truncate pr-2">{tool.Title || tool.title}</span>
                            <LayoutGrid size={13} className={isSelected ? "opacity-100" : "opacity-40"} />
                        </button>
                    );
                })}
            </div>

            {/* Right Content Editor Panel */}
            {currentActiveTool && (
                <div className="space-y-5 md:col-span-8">
                    {/* Info Track Header Banner */}
                    <div className="flex items-center gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 shadow-sm">
                        <Sparkles size={18} className="animate-pulse text-indigo-500" />
                        <div>
                            <h3 className="text-sm font-bold text-[color:var(--foreground)]">
                                Workspace Layer: {currentActiveTool.Title}
                            </h3>
                            <p className="mt-0.5 font-mono text-[10px] text-[color:var(--muted-foreground)]">
                                {selectedToolHref}
                            </p>
                        </div>
                    </div>

                    {/* Core Metadata Section */}
                    <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
                        <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                            <SlidersHorizontal size={12} /> Standard Parameters
                        </h4>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                    Display Name Title
                                </label>
                                <input
                                    type="text"
                                    value={currentActiveTool.Title || ""}
                                    onChange={(e) => updateCurrentToolField("Title", e.target.value)}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                    Route Category Grouping
                                </label>
                                <select
                                    value={currentActiveTool.Category || ""}
                                    onChange={(e) => updateCurrentToolField("Category", e.target.value)}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                                >
                                    <option value="editing">Editing</option>
                                    <option value="convert">Convert</option>
                                    <option value="security">Security</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                Global Tool Hero Description Summary
                            </label>
                            <textarea
                                value={currentActiveTool.Description || ""}
                                onChange={(e) => updateCurrentToolField("Description", e.target.value)}
                                rows={2}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3 text-xs leading-relaxed text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                    Mime Filter Type Limits
                                </label>
                                <input
                                    type="text"
                                    value={currentActiveTool.Accept || ""}
                                    placeholder=".pdf, .docx, image/*"
                                    onChange={(e) => updateCurrentToolField("Accept", e.target.value)}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 font-mono text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                                />
                            </div>

                            <div className="flex h-full items-center gap-6 pt-6 pl-1">
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium select-none text-[color:var(--foreground)]">
                                    <input
                                        type="checkbox"
                                        checked={!!currentActiveTool.Multiple}
                                        onChange={(e) => updateCurrentToolField("Multiple", e.target.checked)}
                                        style={{ accentColor: "var(--primary)" }}
                                        className="h-4 w-4 rounded border-[color:var(--border)] bg-[color:var(--background)]"
                                    />
                                    Allow Batch File Queues
                                </label>

                                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium select-none text-[color:var(--foreground)]">
                                    <input
                                        type="checkbox"
                                        checked={!!currentActiveTool.IsNew}
                                        onChange={(e) => updateCurrentToolField("IsNew", e.target.checked)}
                                        style={{ accentColor: "var(--primary)" }}
                                        className="h-4 w-4 rounded border-[color:var(--border)] bg-[color:var(--background)]"
                                    />
                                    Highlight Badge as "New"
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* SEO Metadata Block */}
                    <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
                        <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                            <Eye size={13} /> Target Search Engine Metadata Optimization
                        </h4>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                    Custom SEO Title Header
                                </label>
                                <input
                                    type="text"
                                    value={currentActiveTool.SeoTitle || ""}
                                    placeholder="Title text indexing value override"
                                    onChange={(e) => updateCurrentToolField("SeoTitle", e.target.value)}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                    Custom SEO Description Summary Snippet
                                </label>
                                <textarea
                                    value={currentActiveTool.SeoDescription || ""}
                                    onChange={(e) => updateCurrentToolField("SeoDescription", e.target.value)}
                                    rows={2}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-3 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                    Search Intent / Core Statement Objective
                                </label>
                                <input
                                    type="text"
                                    value={currentActiveTool.Intent || ""}
                                    onChange={(e) => updateCurrentToolField("Intent", e.target.value)}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Array Content Managers */}
                    <ArrayBadgeManager
                        title="Search Index Keywords"
                        icon={<Hash size={13} />}
                        fieldKey="KeywordsJson"
                        colorClass="text-emerald-500 bg-emerald-500/5 border-emerald-500/10"
                        jsonValue={currentActiveTool.KeywordsJson}
                        onChange={(newValue) => updateCurrentToolField("KeywordsJson", newValue)}
                    />

                    <ArrayBadgeManager
                        title="Inter-Connected Recommended Links"
                        icon={<Link2 size={13} />}
                        fieldKey="RelatedJson"
                        placeholder="/split-pdf"
                        colorClass="text-blue-500 bg-blue-500/5 border-blue-500/10"
                        jsonValue={currentActiveTool.RelatedJson}
                        onChange={(newValue) => updateCurrentToolField("RelatedJson", newValue)}
                    />

                    <ArrayBadgeManager
                        title="Core Feature Advantages Highlights"
                        icon={<CheckCircle2 size={13} />}
                        fieldKey="FeaturesJson"
                        colorClass="text-amber-500 bg-amber-500/5 border-amber-500/10"
                        jsonValue={currentActiveTool.FeaturesJson}
                        onChange={(newValue) => updateCurrentToolField("FeaturesJson", newValue)}
                    />

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

function ArrayBadgeManager({
                               title,
                               icon,
                               placeholder = "Enter value...",
                               colorClass,
                               jsonValue,
                               onChange,
                           }: BadgeManagerProps) {
    const [inputValue, setInputValue] = useState("");
    const items = safeParseArray<string>(jsonValue, []);

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
        <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <h4 className={`flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider ${colorClass.split(" ")[0]}`}>
                {icon} {title}
            </h4>

            <form onSubmit={handleAddItem} className="flex gap-2">
                <input
                    type="text"
                    value={inputValue}
                    placeholder={placeholder}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                />
                <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 text-xs font-bold text-[color:var(--foreground)] transition-colors hover:bg-[var(--card)]"
                >
                    <Plus size={14} /> Insert
                </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-1">
                {items.length === 0 ? (
                    <span className="pl-1 text-xs italic text-[color:var(--muted-foreground)]">
            No metadata array elements attached.
          </span>
                ) : (
                    items.map((val: string, index: number) => (
                        <div
                            key={val + index}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${colorClass}`}
                        >
                            <span>{val}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="ml-0.5 opacity-60 transition-all hover:text-red-500 hover:opacity-100"
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
    const faqs: FAQItem[] = safeParseArray<FAQItem>(jsonValue, []);
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
        <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <h4 className="flex items-center gap-1.5 border-b border-[color:var(--border)] pb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--primary)]">
                <HelpCircle size={13} /> Interactive FAQ List Builder
            </h4>

            <div className="space-y-3">
                {faqs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--background)]/40 p-3 text-center text-xs italic text-[color:var(--muted-foreground)]">
                        No frequently asked questions stored for this tool module.
                    </div>
                ) : (
                    faqs.map((faq, index) => (
                        <div
                            key={index}
                            className="group relative space-y-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4 shadow-sm"
                        >
                            <button
                                type="button"
                                onClick={() => handleRemoveFaq(index)}
                                className="absolute right-4 top-4 rounded-lg p-1 text-[color:var(--muted-foreground)] transition-all hover:bg-red-500/5 hover:text-red-500 md:opacity-0 group-hover:opacity-100"
                                title="Delete FAQ Row"
                            >
                                <Trash2 size={14} />
                            </button>

                            <h5 className="flex gap-1.5 pr-6 text-xs font-bold text-[color:var(--foreground)]">
                                <span className="font-mono text-indigo-500">Q:</span> {faq.question}
                            </h5>
                            <p className="flex gap-1.5 pt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
                                <span className="font-mono text-emerald-500">A:</span> {faq.answer}
                            </p>
                        </div>
                    ))
                )}
            </div>

            <form
                onSubmit={handleAddNewFaq}
                className="mt-4 space-y-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4 pt-3"
            >
        <span className="block text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
          Add New FAQ Accordion Row
        </span>

                <div className="space-y-2">
                    <input
                        type="text"
                        value={newQuestion}
                        placeholder="Question title (e.g., Is it free?)"
                        onChange={(e) => setNewQuestion(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                    />
                    <textarea
                        value={newAnswer}
                        placeholder="Answer statement copy context..."
                        onChange={(e) => setNewAnswer(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[var(--card)] p-3 text-xs leading-relaxed text-[color:var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
                    />
                </div>

                <button
                    type="submit"
                    disabled={!newQuestion.trim() || !newAnswer.trim()}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--primary)] py-2 text-xs font-bold text-white transition-all hover:brightness-105 disabled:opacity-40"
                >
                    <Plus size={14} /> Append Question Row
                </button>
            </form>
        </div>
    );
}