"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    ArrowRight,
    BadgeInfo,
    Clock3,
    Loader2,
    Mail,
    MessageSquareReply,
    PencilLine,
    Plus,
    RefreshCw,
    Search,
    ShieldAlert,
    Tag,
    Trash2,
    Users,
} from "lucide-react";
import { fetchJson } from "@/lib/api";

type Ticket = {
    ID: string;
    TicketNumber: string;
    UserID?: string | null;
    AssignedToID?: string | null;
    Name?: string | null;
    Email: string;
    Category: string;
    Subject: string;
    Message: string;
    Status: string;
    Priority: string;
    Source: string;
    InternalNotes?: string;
    IPAddress?: string;
    UserAgent?: string;
    ResolvedAt?: string | null;
    ClosedAt?: string | null;
    LastActivityAt?: string | null;
    CreatedAt: string;
    UpdatedAt: string;
    EmailStatus?: string;
};

type Category = {
    ID: string;
    Name: string;
    Slug: string;
    Type: string;
    Description?: string;
    Color?: string;
    SortOrder: number;
    IsActive: boolean;
    CreatedAt: string;
    UpdatedAt: string;
};

type Dashboard = {
    total: number;
    open: number;
    in_progress: number;
    waiting_user: number;
    resolved: number;
    closed: number;
    today: number;
    this_week: number;
    this_month: number;
    by_status: Record<string, number>;
    by_priority: Record<string, number>;
};

type Reports = {
    status_counts: Record<string, number>;
    priority_counts: Record<string, number>;
    category_counts: { name: string; count: number }[];
    recent_tickets: Ticket[];
};

type TicketListResponse = {
    items: Ticket[];
    total: number;
    page: number;
    limit: number;
};

const DEFAULT_REPLIES = {
    open: "Hello,\n\nThanks for reaching out to Platen PDF. We received your message and are checking it now.\n\nBest,\nPlaten Support",
    waiting_user: "Hello,\n\nThanks for the update. We are waiting on your reply before moving forward.\n\nBest,\nPlaten Support",
    resolved: "Hello,\n\nThis issue has been resolved from our side. If anything still looks wrong, reply to this email and we will continue helping.\n\nBest,\nPlaten Support",
};

export default function ContactCenter() {
    const [dashboard, setDashboard] = useState<Dashboard | null>(null);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [reports, setReports] = useState<Reports | null>(null);

    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>("");
    const [notice, setNotice] = useState<string>("");

    const [filters, setFilters] = useState({
        search: "",
        status: "",
        category: "",
        priority: "",
        sort: "updated",
        page: 1,
        limit: 20,
    });

    const [statusDraft, setStatusDraft] = useState("open");
    const [priorityDraft, setPriorityDraft] = useState("normal");
    const [notesDraft, setNotesDraft] = useState("");
    const [replyDraft, setReplyDraft] = useState("");
    const [replyMode, setReplyMode] = useState<"custom" | "open" | "waiting_user" | "resolved">("custom");

    const [categoryEditorId, setCategoryEditorId] = useState<string | null>(null);
    const [categoryDraft, setCategoryDraft] = useState({
        name: "",
        slug: "",
        type: "other",
        description: "",
        color: "slate",
        sort_order: 0,
        is_active: true,
    });

    const [newCategory, setNewCategory] = useState({
        name: "",
        slug: "",
        type: "other",
        description: "",
        color: "slate",
        sort_order: 0,
        is_active: true,
    });

    async function api<T>(path: string, init?: RequestInit): Promise<T> {
        const res = await fetchJson(path, init as any);
        return res as T;
    }

    async function loadAll() {
        setLoading(true);
        setError("");

        try {
            const q = new URLSearchParams();
            q.set("page", String(filters.page));
            q.set("limit", String(filters.limit));
            if (filters.search) q.set("search", filters.search);
            if (filters.status) q.set("status", filters.status);
            if (filters.category) q.set("category", filters.category);
            if (filters.priority) q.set("priority", filters.priority);
            if (filters.sort) q.set("sort", filters.sort);

            const [dash, ticketList, categoryList, reportData] = await Promise.all([
                api<Dashboard>("/admin/contact/dashboard"),
                api<TicketListResponse>(`/admin/contact/tickets?${q.toString()}`),
                api<{ items: Category[] }>("/admin/contact/categories"),
                api<Reports>("/admin/contact/reports"),
            ]);

            setDashboard(dash);
            setTickets(ticketList.items || []);
            setCategories(categoryList.items || []);
            setReports(reportData);

            if (!selectedTicket && ticketList.items?.length) {
                selectTicket(ticketList.items[0]);
            } else if (selectedTicket) {
                const updated = ticketList.items.find((t) => t.ID === selectedTicket.ID);
                if (updated) {
                    setSelectedTicket(updated);
                    syncDrafts(updated);
                }
            }
        } catch (e: any) {
            setError(e?.message || "Failed to load contact admin data.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredSelectedCategory = useMemo(() => {
        if (!selectedTicket) return null;
        return categories.find((c) => c.Name === selectedTicket.Category || c.Slug === selectedTicket.Category) || null;
    }, [categories, selectedTicket]);

    function syncDrafts(ticket: Ticket) {
        setStatusDraft(ticket.Status || "open");
        setPriorityDraft(ticket.Priority || "normal");
        setNotesDraft(ticket.InternalNotes || "");
        setReplyMode("custom");
        setReplyDraft(DEFAULT_REPLIES[(ticket.Status as keyof typeof DEFAULT_REPLIES) || "open"] || DEFAULT_REPLIES.open);
    }

    function selectTicket(ticket: Ticket) {
        setSelectedTicket(ticket);
        syncDrafts(ticket);
    }

    async function refreshSelectedTicket() {
        if (!selectedTicket) return;
        const data = await api<{ ticket: Ticket }>(`/admin/contact/tickets/${selectedTicket.ID}`);
        setSelectedTicket(data.ticket);
        syncDrafts(data.ticket);
    }

    async function updateStatus() {
        if (!selectedTicket) return;
        setSaving(true);
        setError("");
        try {
            await api(`/admin/contact/tickets/${selectedTicket.ID}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: statusDraft }),
            });
            setNotice("Status updated.");
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to update status.");
        } finally {
            setSaving(false);
        }
    }

    async function updatePriority() {
        if (!selectedTicket) return;
        setSaving(true);
        setError("");
        try {
            await api(`/admin/contact/tickets/${selectedTicket.ID}/priority`, {
                method: "PATCH",
                body: JSON.stringify({ priority: priorityDraft }),
            });
            setNotice("Priority updated.");
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to update priority.");
        } finally {
            setSaving(false);
        }
    }

    async function saveNotes() {
        if (!selectedTicket) return;
        setSaving(true);
        setError("");
        try {
            await api(`/admin/contact/tickets/${selectedTicket.ID}/notes`, {
                method: "PATCH",
                body: JSON.stringify({ internal_notes: notesDraft }),
            });
            setNotice("Internal notes saved.");
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to save notes.");
        } finally {
            setSaving(false);
        }
    }

    async function sendReply() {
        if (!selectedTicket) return;
        setSaving(true);
        setError("");
        try {
            await api(`/admin/contact/tickets/${selectedTicket.ID}/reply`, {
                method: "POST",
                body: JSON.stringify({ message: replyDraft }),
            });
            setNotice("Reply sent by email.");
            await refreshSelectedTicket();
        } catch (e: any) {
            setError(e?.message || "Failed to send reply.");
        } finally {
            setSaving(false);
        }
    }

    async function createCategory() {
        setSaving(true);
        setError("");
        try {
            await api(`/admin/contact/categories`, {
                method: "POST",
                body: JSON.stringify(newCategory),
            });
            setNotice("Category created.");
            setNewCategory({
                name: "",
                slug: "",
                type: "other",
                description: "",
                color: "slate",
                sort_order: 0,
                is_active: true,
            });
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to create category.");
        } finally {
            setSaving(false);
        }
    }

    function beginEditCategory(category: Category) {
        setCategoryEditorId(category.ID);
        setCategoryDraft({
            name: category.Name,
            slug: category.Slug,
            type: category.Type,
            description: category.Description || "",
            color: category.Color || "slate",
            sort_order: category.SortOrder || 0,
            is_active: category.IsActive,
        });
    }

    async function saveCategory(categoryID: string) {
        setSaving(true);
        setError("");
        try {
            await api(`/admin/contact/categories/${categoryID}`, {
                method: "PATCH",
                body: JSON.stringify(categoryDraft),
            });
            setCategoryEditorId(null);
            setNotice("Category updated.");
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to update category.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteCategory(categoryID: string) {
        if (!confirm("Delete this category?")) return;
        setSaving(true);
        setError("");
        try {
            await api(`/admin/contact/categories/${categoryID}`, {
                method: "DELETE",
            });
            setNotice("Category deleted.");
            await loadAll();
        } catch (e: any) {
            setError(e?.message || "Failed to delete category.");
        } finally {
            setSaving(false);
        }
    }

    const statusCards = [
        { label: "Open", value: dashboard?.open ?? 0 },
        { label: "In progress", value: dashboard?.in_progress ?? 0 },
        { label: "Waiting user", value: dashboard?.waiting_user ?? 0 },
        { label: "Resolved", value: dashboard?.resolved ?? 0 },
        { label: "Closed", value: dashboard?.closed ?? 0 },
    ];

    const priorityCards = [
        { label: "Low", value: dashboard?.by_priority?.low ?? 0 },
        { label: "Normal", value: dashboard?.by_priority?.normal ?? 0 },
        { label: "High", value: dashboard?.by_priority?.high ?? 0 },
        { label: "Urgent", value: dashboard?.by_priority?.urgent ?? 0 },
    ];

    if (loading) {
        return (
            <div className="flex min-h-[70vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-[color:var(--background)] px-4 py-6 text-[color:var(--foreground)] sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/35 p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Support Center
                        </div>
                        <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                            Contact admin
                        </h1>
                        <p className="max-w-3xl text-sm leading-7 text-[color:var(--muted)]">
                            Manage tickets, update status, edit private notes, send email replies, and maintain categories.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            href="/admin"
                            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-semibold transition hover:border-indigo-500 hover:text-indigo-500"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Admin dashboard
                        </Link>
                        <button
                            type="button"
                            onClick={loadAll}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-500">
                        {error}
                    </div>
                ) : null}

                {notice ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-500">
                        {notice}
                    </div>
                ) : null}

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard title="Total tickets" value={dashboard?.total ?? 0} />
                    <StatCard title="Today" value={dashboard?.today ?? 0} />
                    <StatCard title="This week" value={dashboard?.this_week ?? 0} />
                    <StatCard title="This month" value={dashboard?.this_month ?? 0} />
                </section>

                <section className="grid gap-4 md:grid-cols-5">
                    {statusCards.map((card) => (
                        <MiniCard key={card.label} title={card.label} value={card.value} />
                    ))}
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
                    {/* Ticket list */}
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/35 p-5 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 className="text-2xl font-black">Tickets</h2>
                                <p className="text-sm text-[color:var(--muted)]">
                                    Click a ticket to open details and actions.
                                </p>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                                <SearchInput
                                    value={filters.search}
                                    onChange={(search) => setFilters((f) => ({ ...f, search }))}
                                    placeholder="Search"
                                />
                                <Select
                                    value={filters.status}
                                    onChange={(status) => setFilters((f) => ({ ...f, status }))}
                                    options={[
                                        ["", "All status"],
                                        ["open", "Open"],
                                        ["in_progress", "In progress"],
                                        ["waiting_user", "Waiting user"],
                                        ["resolved", "Resolved"],
                                        ["closed", "Closed"],
                                    ]}
                                />
                                <Select
                                    value={filters.priority}
                                    onChange={(priority) => setFilters((f) => ({ ...f, priority }))}
                                    options={[
                                        ["", "All priority"],
                                        ["low", "Low"],
                                        ["normal", "Normal"],
                                        ["high", "High"],
                                        ["urgent", "Urgent"],
                                    ]}
                                />
                                <Select
                                    value={filters.category}
                                    onChange={(category) => setFilters((f) => ({ ...f, category }))}
                                    options={[
                                        ["", "All categories"],
                                        ...categories.map((c) => [c.Name, c.Name] as [string, string]),
                                    ]}
                                />
                                <Select
                                    value={filters.sort}
                                    onChange={(sort) => setFilters((f) => ({ ...f, sort }))}
                                    options={[
                                        ["updated", "Recently active"],
                                        ["newest", "Newest"],
                                        ["oldest", "Oldest"],
                                        ["priority", "Priority"],
                                    ]}
                                />
                                <button
                                    onClick={loadAll}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--border)]">
                            <div className="max-h-[700px] overflow-auto">
                                <table className="min-w-full text-left text-sm">
                                    <thead className="sticky top-0 z-10 bg-[var(--background)]">
                                    <tr className="border-b border-[color:var(--border)]">
                                        <th className="px-4 py-3 font-semibold">Ticket</th>
                                        <th className="px-4 py-3 font-semibold">Category</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                        <th className="px-4 py-3 font-semibold">Priority</th>
                                        <th className="px-4 py-3 font-semibold">Updated</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {tickets.map((ticket) => {
                                        const active = selectedTicket?.ID === ticket.ID;
                                        return (
                                            <tr
                                                key={ticket.ID}
                                                onClick={() => selectTicket(ticket)}
                                                className={`cursor-pointer border-b border-[color:var(--border)] transition hover:bg-indigo-500/5 ${
                                                    active ? "bg-indigo-500/10" : ""
                                                }`}
                                            >
                                                <td className="px-4 py-4">
                                                    <div className="font-bold">{ticket.TicketNumber}</div>
                                                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                                                        {ticket.Name || "No name"} · {ticket.Email}
                                                    </div>
                                                    <div className="mt-1 line-clamp-1 text-xs text-[color:var(--muted)]">
                                                        {ticket.Subject}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">{ticket.Category}</td>
                                                <td className="px-4 py-4">
                                                    <StatusPill value={ticket.Status} />
                                                </td>
                                                <td className="px-4 py-4">
                                                    <PriorityPill value={ticket.Priority} />
                                                </td>
                                                <td className="px-4 py-4 text-xs text-[color:var(--muted)]">
                                                    {new Date(ticket.UpdatedAt).toLocaleString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Selected ticket */}
                    <div className="space-y-6">
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/35 p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-2xl font-black">Selected ticket</h2>
                                <button
                                    onClick={refreshSelectedTicket}
                                    disabled={!selectedTicket}
                                    className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold transition hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-40"
                                >
                                    Refresh ticket
                                </button>
                            </div>

                            {selectedTicket ? (
                                <div className="mt-5 space-y-4">
                                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">
                                                {selectedTicket.TicketNumber}
                                            </span>
                                            <span className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                                {selectedTicket.EmailStatus || "pending"}
                                            </span>
                                        </div>

                                        <h3 className="mt-3 text-xl font-black tracking-tight">
                                            {selectedTicket.Subject}
                                        </h3>
                                        <p className="mt-2 text-sm text-[color:var(--muted)]">
                                            {selectedTicket.Name || "No name"} · {selectedTicket.Email}
                                        </p>

                                        <div className="mt-4 grid gap-2 text-xs text-[color:var(--muted)]">
                                            <div className="flex items-center gap-2">
                                                <Tag className="h-3.5 w-3.5" />
                                                Category: {selectedTicket.Category}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock3 className="h-3.5 w-3.5" />
                                                Created: {new Date(selectedTicket.CreatedAt).toLocaleString()}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <BadgeInfo className="h-3.5 w-3.5" />
                                                Source: {selectedTicket.Source}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2">
                                        <label className="space-y-2">
                                            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                                Status
                                            </span>
                                            <select
                                                value={statusDraft}
                                                onChange={(e) => setStatusDraft(e.target.value)}
                                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none"
                                            >
                                                <option value="open">Open</option>
                                                <option value="in_progress">In progress</option>
                                                <option value="waiting_user">Waiting user</option>
                                                <option value="resolved">Resolved</option>
                                                <option value="closed">Closed</option>
                                            </select>
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                                Priority
                                            </span>
                                            <select
                                                value={priorityDraft}
                                                onChange={(e) => setPriorityDraft(e.target.value)}
                                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none"
                                            >
                                                <option value="low">Low</option>
                                                <option value="normal">Normal</option>
                                                <option value="high">High</option>
                                                <option value="urgent">Urgent</option>
                                            </select>
                                        </label>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={updateStatus}
                                            disabled={saving}
                                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            <PencilLine className="h-4 w-4" />
                                            Save status
                                        </button>
                                        <button
                                            onClick={updatePriority}
                                            disabled={saving}
                                            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-semibold transition hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-50"
                                        >
                                            <Tag className="h-4 w-4" />
                                            Save priority
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                                Internal notes
                                            </span>
                                            <span className="text-xs text-[color:var(--muted)]">
                                                Admin-only
                                            </span>
                                        </div>
                                        <textarea
                                            rows={6}
                                            value={notesDraft}
                                            onChange={(e) => setNotesDraft(e.target.value)}
                                            className="w-full rounded-2xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none"
                                            placeholder="Private notes for admins"
                                        />
                                        <button
                                            onClick={saveNotes}
                                            disabled={saving}
                                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            <SaveIcon />
                                            Save notes
                                        </button>
                                    </div>

                                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4">
                                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                            Ticket body
                                        </div>
                                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[color:var(--foreground)]">
                                            {selectedTicket.Message}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4 text-xs text-[color:var(--muted)]">
                                        <div className="grid gap-2">
                                            <div>IP: {selectedTicket.IPAddress || "—"}</div>
                                            <div>User agent: {selectedTicket.UserAgent || "—"}</div>
                                            <div>Resolved: {selectedTicket.ResolvedAt ? new Date(selectedTicket.ResolvedAt).toLocaleString() : "—"}</div>
                                            <div>Closed: {selectedTicket.ClosedAt ? new Date(selectedTicket.ClosedAt).toLocaleString() : "—"}</div>
                                            <div>Last activity: {selectedTicket.LastActivityAt ? new Date(selectedTicket.LastActivityAt).toLocaleString() : "—"}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-[color:var(--muted)]">
                                    Select a ticket from the table.
                                </p>
                            )}
                        </div>

                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/35 p-5 shadow-sm">
                            <div className="flex items-center gap-2">
                                <MessageSquareReply className="h-5 w-5 text-indigo-500" />
                                <h2 className="text-2xl font-black">Reply by email</h2>
                            </div>
                            <p className="mt-2 text-sm leading-7 text-[color:var(--muted)]">
                                This sends an email to the customer. The reply itself is not saved in the database.
                            </p>

                            {selectedTicket ? (
                                <div className="mt-4 space-y-4">
                                    <div className="flex flex-wrap gap-2">
                                        {(["custom", "open", "waiting_user", "resolved"] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => {
                                                    setReplyMode(mode);
                                                    if (mode === "custom") return;
                                                    setReplyDraft(DEFAULT_REPLIES[mode]);
                                                }}
                                                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] transition ${
                                                    replyMode === mode
                                                        ? "bg-indigo-600 text-white"
                                                        : "border border-[color:var(--border)] bg-[var(--background)] text-[color:var(--muted)] hover:border-indigo-500 hover:text-indigo-500"
                                                }`}
                                            >
                                                {mode.replace("_", " ")}
                                            </button>
                                        ))}
                                    </div>

                                    <textarea
                                        rows={10}
                                        value={replyDraft}
                                        onChange={(e) => {
                                            setReplyDraft(e.target.value);
                                            setReplyMode("custom");
                                        }}
                                        className="w-full rounded-2xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none"
                                        placeholder="Write the reply to the customer"
                                    />

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={sendReply}
                                            disabled={saving}
                                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            <Mail className="h-4 w-4" />
                                            Send reply
                                        </button>

                                        <button
                                            onClick={() => {
                                                setReplyMode("open");
                                                setReplyDraft(DEFAULT_REPLIES.open);
                                            }}
                                            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-semibold transition hover:border-indigo-500 hover:text-indigo-500"
                                        >
                                            <ArrowRight className="h-4 w-4" />
                                            Reset template
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-[color:var(--muted)]">
                                    Choose a ticket first.
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    {/* Categories */}
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/35 p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Tag className="h-5 w-5 text-indigo-500" />
                            <h2 className="text-2xl font-black">Categories</h2>
                        </div>
                        <p className="mt-2 text-sm text-[color:var(--muted)]">
                            Create and manage ticket groups by type.
                        </p>

                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                            <InputField
                                label="Name"
                                value={newCategory.name}
                                onChange={(value) => setNewCategory((c) => ({ ...c, name: value }))}
                                placeholder="Billing"
                            />
                            <InputField
                                label="Slug"
                                value={newCategory.slug}
                                onChange={(value) => setNewCategory((c) => ({ ...c, slug: value }))}
                                placeholder="billing"
                            />
                            <InputField
                                label="Type"
                                value={newCategory.type}
                                onChange={(value) => setNewCategory((c) => ({ ...c, type: value }))}
                                placeholder="billing"
                            />
                            <InputField
                                label="Color"
                                value={newCategory.color}
                                onChange={(value) => setNewCategory((c) => ({ ...c, color: value }))}
                                placeholder="indigo"
                            />
                            <InputField
                                label="Sort order"
                                value={String(newCategory.sort_order)}
                                onChange={(value) =>
                                    setNewCategory((c) => ({ ...c, sort_order: Number(value || 0) }))
                                }
                                placeholder="0"
                                type="number"
                            />
                            <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={newCategory.is_active}
                                    onChange={(e) => setNewCategory((c) => ({ ...c, is_active: e.target.checked }))}
                                />
                                Active
                            </label>
                            <div className="md:col-span-2">
                                <InputField
                                    label="Description"
                                    value={newCategory.description}
                                    onChange={(value) => setNewCategory((c) => ({ ...c, description: value }))}
                                    placeholder="General billing support"
                                />
                            </div>
                        </div>

                        <button
                            onClick={createCategory}
                            disabled={saving}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                        >
                            <Plus className="h-4 w-4" />
                            Create category
                        </button>

                        <div className="mt-6 space-y-3">
                            {categories.map((category) => {
                                const editing = categoryEditorId === category.ID;
                                return (
                                    <div
                                        key={category.ID}
                                        className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4"
                                    >
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-lg font-bold">{category.Name}</span>
                                                    <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-500">
                                                        {category.Type}
                                                    </span>
                                                    <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                                        {category.IsActive ? "active" : "disabled"}
                                                    </span>
                                                </div>
                                                <div className="text-sm text-[color:var(--muted)]">
                                                    {category.Slug} · {category.Color || "slate"}
                                                </div>
                                                {category.Description ? (
                                                    <p className="max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
                                                        {category.Description}
                                                    </p>
                                                ) : null}
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => beginEditCategory(category)}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold transition hover:border-indigo-500 hover:text-indigo-500"
                                                >
                                                    <PencilLine className="h-3.5 w-3.5" />
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => deleteCategory(category.ID)}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs font-semibold text-rose-500 transition hover:bg-rose-500/10"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Delete
                                                </button>
                                            </div>
                                        </div>

                                        {editing ? (
                                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                                <InputField
                                                    label="Name"
                                                    value={categoryDraft.name}
                                                    onChange={(value) => setCategoryDraft((d) => ({ ...d, name: value }))}
                                                />
                                                <InputField
                                                    label="Slug"
                                                    value={categoryDraft.slug}
                                                    onChange={(value) => setCategoryDraft((d) => ({ ...d, slug: value }))}
                                                />
                                                <InputField
                                                    label="Type"
                                                    value={categoryDraft.type}
                                                    onChange={(value) => setCategoryDraft((d) => ({ ...d, type: value }))}
                                                />
                                                <InputField
                                                    label="Color"
                                                    value={categoryDraft.color}
                                                    onChange={(value) => setCategoryDraft((d) => ({ ...d, color: value }))}
                                                />
                                                <InputField
                                                    label="Sort order"
                                                    value={String(categoryDraft.sort_order)}
                                                    onChange={(value) =>
                                                        setCategoryDraft((d) => ({
                                                            ...d,
                                                            sort_order: Number(value || 0),
                                                        }))
                                                    }
                                                    type="number"
                                                />
                                                <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={categoryDraft.is_active}
                                                        onChange={(e) =>
                                                            setCategoryDraft((d) => ({
                                                                ...d,
                                                                is_active: e.target.checked,
                                                            }))
                                                        }
                                                    />
                                                    Active
                                                </label>
                                                <div className="md:col-span-2">
                                                    <InputField
                                                        label="Description"
                                                        value={categoryDraft.description}
                                                        onChange={(value) =>
                                                            setCategoryDraft((d) => ({
                                                                ...d,
                                                                description: value,
                                                            }))
                                                        }
                                                    />
                                                </div>

                                                <div className="md:col-span-2 flex flex-wrap gap-3">
                                                    <button
                                                        onClick={() => saveCategory(category.ID)}
                                                        disabled={saving}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                                                    >
                                                        Save category
                                                    </button>
                                                    <button
                                                        onClick={() => setCategoryEditorId(null)}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-semibold transition hover:border-indigo-500 hover:text-indigo-500"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reports */}
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/35 p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-indigo-500" />
                            <h2 className="text-2xl font-black">Reports</h2>
                        </div>
                        <p className="mt-2 text-sm text-[color:var(--muted)]">
                            Quick summary of support activity.
                        </p>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            {priorityCards.map((card) => (
                                <MiniCard key={card.label} title={`${card.label} priority`} value={card.value} />
                            ))}
                        </div>

                        <div className="mt-5 space-y-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4">
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                Tickets by category
                            </h3>
                            {(reports?.category_counts || []).map((entry) => (
                                <div key={entry.name} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span>{entry.name}</span>
                                        <span className="text-[color:var(--muted)]">{entry.count}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-[color:var(--border)]">
                                        <div
                                            className="h-2 rounded-full bg-indigo-500"
                                            style={{ width: `${Math.min(100, entry.count * 10)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 space-y-3">
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                Recent tickets
                            </h3>
                            {(reports?.recent_tickets || []).map((ticket) => (
                                <div
                                    key={ticket.ID}
                                    className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="font-bold">{ticket.TicketNumber}</div>
                                            <div className="text-sm text-[color:var(--muted)]">
                                                {ticket.Subject}
                                            </div>
                                        </div>
                                        <StatusPill value={ticket.Status} />
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--muted)]">
                                        <span>{ticket.Category}</span>
                                        <span>{new Date(ticket.CreatedAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-2xl font-black tracking-tight">Need to open the public contact page?</h3>
                            <p className="mt-2 max-w-2xl text-sm leading-7 text-[color:var(--muted)]">
                                Use the public form to test tickets, attachments, and email delivery.
                            </p>
                        </div>

                        <Link
                            href="/contact"
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                        >
                            Open contact page
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}

function StatCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/35 p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                {title}
            </div>
            <div className="mt-3 text-4xl font-black tracking-tight">{value}</div>
        </div>
    );
}

function MiniCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                {title}
            </div>
            <div className="mt-2 text-2xl font-black">{value}</div>
        </div>
    );
}

function StatusPill({ value }: { value: string }) {
    const v = value?.toLowerCase?.() || "open";
    const tone =
        v === "resolved" || v === "closed"
            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
            : v === "waiting_user"
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                : v === "in_progress"
                    ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                    : "bg-[color:var(--border)]/30 text-[color:var(--muted)] border-[color:var(--border)]";
    return (
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${tone}`}>
            {value}
        </span>
    );
}

function PriorityPill({ value }: { value: string }) {
    const v = value?.toLowerCase?.() || "normal";
    const tone =
        v === "urgent"
            ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
            : v === "high"
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                : v === "low"
                    ? "bg-slate-500/10 text-slate-500 border-slate-500/20"
                    : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    return (
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${tone}`}>
            {value}
        </span>
    );
}

function InputField({
                        label,
                        value,
                        onChange,
                        placeholder,
                        type = "text",
                    }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
}) {
    return (
        <label className="space-y-2 block">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                {label}
            </span>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-2xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none"
            />
        </label>
    );
}

function SearchInput({
                         value,
                         onChange,
                         placeholder,
                     }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) {
    return (
        <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] py-3 pl-9 pr-4 text-sm outline-none"
            />
        </label>
    );
}

function Select({
                    value,
                    onChange,
                    options,
                }: {
    value: string;
    onChange: (value: string) => void;
    options: [string, string][];
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none"
        >
            {options.map(([val, label]) => (
                <option key={val + label} value={val}>
                    {label}
                </option>
            ))}
        </select>
    );
}

function SaveIcon() {
    return <RefreshCw className="h-4 w-4" />;
}