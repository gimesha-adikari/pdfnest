"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { fetchJson } from "@/lib/api";
import {
    Ban,
    BarChart3,
    CheckCircle,
    CreditCard,
    Edit3,
    Eye,
    History,
    Info,
    Loader2,
    Save,
    ShieldAlert,
    ShieldCheck,
    Users,
    X,
    Coins,
    FileText
} from "lucide-react";
import { notify } from "@/lib/notify";

export default function AdminPage() {
    const { isAuthenticated, isLoading, user } = useAuth();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"users" | "subscriptions" | "metrics">("users");
    const [usersList, setUsersList] = useState<any[]>([]);
    const [subsList, setSubsList] = useState<any[]>([]);
    const [isFetching, setIsFetching] = useState(true);

    const [editingSubId, setEditingSubId] = useState<string | null>(null);
    const [editTier, setEditTier] = useState("");
    const [editStatus, setEditStatus] = useState("");
    const [editCredits, setEditCredits] = useState<number>(0);
    const [editDays, setEditDays] = useState(0);

    const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
    const [isInspecting, setIsInspecting] = useState(false);

    const [metrics, setMetrics] = useState<any>(null);

    const MASTER_EMAIL = "gimeshaadikari23@gmail.com";

    // Stop body from scrolling when the panel is open
    useEffect(() => {
        if (selectedUserDetail) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [selectedUserDetail]);

    useEffect(() => {
        if (isLoading) return;
        if (!isAuthenticated || user?.role !== "admin") {
            router.push("/");
            return;
        }
        fetchData();
    }, [isLoading, isAuthenticated, user, router]);

    const fetchData = async () => {
        setIsFetching(true);
        try {
            const [usersData, subsData, metricsData] = await Promise.all([
                fetchJson("/admin/users") as Promise<any[]>,
                fetchJson("/admin/subscriptions") as Promise<any[]>,
                fetchJson("/admin/metrics") as Promise<any>
            ]);
            setUsersList(usersData || []);
            setSubsList(subsData || []);
            setMetrics(metricsData);
        } catch (err) {
            console.error("Failed to fetch admin data", err);
        } finally {
            setIsFetching(false);
        }
    };

    const handleInspectUser = async (userId: string) => {
        setIsInspecting(true);
        try {
            const data = await fetchJson(`/admin/users/${userId}/details`) as any;
            setSelectedUserDetail(data);

            if (data.subscription) {
                setEditTier(data.subscription.Tier || "free");
                setEditStatus(data.subscription.Status || "active");
                setEditCredits(data.subscription.CustomCredits || 0);
            } else {
                setEditTier("free");
                setEditStatus("active");
                setEditCredits(0);
            }
            setEditDays(0);
        } catch (err) {
            notify("Failed to load full user target metrics.");
        } finally {
            setIsInspecting(false);
        }
    };

    const handleBanToggle = async (id: string, email: string) => {
        if (email === MASTER_EMAIL) {
            notify("Action Prevented: Master admin accounts cannot be suspended.", "warning");
            return;
        }
        try {
            const res = await fetchJson(`/admin/users/${id}/ban`, { method: "PATCH" }) as any;
            setUsersList(usersList.map(u => u.ID === id ? { ...u, Status: res.updated_status } : u));
            if (selectedUserDetail && selectedUserDetail.user.ID === id) {
                setSelectedUserDetail({
                    ...selectedUserDetail,
                    user: { ...selectedUserDetail.user, Status: res.updated_status }
                });
            }
        } catch (err) {
            notify("Failed to update user status.", "error");
        }
    };

    const handleRoleChange = async (id: string, email: string, currentRole: string) => {
        if (email === MASTER_EMAIL) {
            notify("Action Prevented: Master admin roles are unalterable.", "warning");
            return;
        }
        const newRole = currentRole === "admin" ? "user" : "admin";
        if (!confirm(`Change role to ${newRole.toUpperCase()}?`)) return;

        try {
            const res = await fetchJson(`/admin/users/${id}/role`, {
                method: "PATCH",
                body: JSON.stringify({ role: newRole })
            }) as any;
            setUsersList(usersList.map(u => u.ID === id ? { ...u, Role: res.new_role } : u));
            if (selectedUserDetail && selectedUserDetail.user.ID === id) {
                setSelectedUserDetail({
                    ...selectedUserDetail,
                    user: { ...selectedUserDetail.user, Role: res.new_role }
                });
            }
        } catch (err) {
            notify("Failed to update user role.", "error");
        }
    };

    const handleSaveSubscription = async (userId: string, email: string) => {
        if (email === MASTER_EMAIL) {
            notify("Action Prevented: Master admin subscriptions are unalterable.", "warning");
            return;
        }
        try {
            await fetchJson(`/admin/users/${userId}/tier`, {
                method: "PATCH",
                body: JSON.stringify({
                    tier: editTier,
                    status: editStatus,
                    custom_credits: Number(editCredits),
                    days_to_plus: Number(editDays)
                })
            });
            notify("Subscription parameter updates deployed successfully.", "success");
            setEditingSubId(null);
            fetchData();
            if (selectedUserDetail && selectedUserDetail.user.ID === userId) {
                handleInspectUser(userId);
            }
        } catch (err) {
            notify("Failed saving package configuration changes.", "error");
        }
    };

    if (isLoading || isFetching) {
        return <div className="min-h-screen flex items-center justify-center bg-[var(--background)]"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
    }

    return (
        <div className="min-h-screen bg-[var(--background)] p-8 text-[color:var(--foreground)] relative">
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>

            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[var(--card)] p-6 border border-[color:var(--border)] rounded-2xl">
                    <div>
                        <h1 className="text-3xl font-black flex items-center gap-3">
                            <ShieldAlert className="text-indigo-500" /> Advanced Admin Control Panel
                        </h1>
                        <p className="text-[color:var(--muted-foreground)] text-xs mt-2">Modify live user states, manage limits, inspect user transaction data ledgers, and check platform health logs.</p>
                    </div>
                    <Link
                        href="/admin/content"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all self-start sm:self-center"
                    >
                        <FileText size={14} /> Site Content Editor
                    </Link>
                </div>

                {/* Tab Row */}
                <div className="flex gap-4 border-b border-[color:var(--border)] pb-px">
                    <button
                        onClick={() => setActiveTab("users")}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${activeTab === "users" ? "border-indigo-500 text-indigo-500" : "border-transparent text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"}`}
                    >
                        <Users size={18} /> User Access Matrix ({usersList.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("subscriptions")}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${activeTab === "subscriptions" ? "border-indigo-500 text-indigo-500" : "border-transparent text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"}`}
                    >
                        <CreditCard size={18} /> Package Status Overrides ({subsList.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("metrics")}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${activeTab === "metrics" ? "border-indigo-500 text-indigo-500" : "border-transparent text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"}`}
                    >
                        <BarChart3 size={18} /> Analytics Metrics
                    </button>
                </div>

                {/* Users Tab */}
                {activeTab === "users" && (
                    <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[color:var(--background)]/50 border-b border-[color:var(--border)]">
                            <tr>
                                <th className="p-4 font-semibold">Email Target Address</th>
                                <th className="p-4 font-semibold">Role</th>
                                <th className="p-4 font-semibold">Status</th>
                                <th className="p-4 text-right">Operations & Analytics</th>
                            </tr>
                            </thead>
                            <tbody>
                            {usersList.map((u) => (
                                <tr key={u.ID} className="border-b border-[color:var(--border)] last:border-0 hover:bg-[color:var(--background)]/30 transition-colors">
                                    <td className="p-4 font-medium flex items-center gap-2">
                                        {u.Email}
                                        {u.Email === MASTER_EMAIL && (
                                            <span title="Immune Master Account"><ShieldCheck size={16} className="text-indigo-500" /></span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                            <span className={`px-2 py-1 rounded-md text-xs font-black uppercase ${u.Role === 'admin' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-neutral-500/10 text-neutral-400'}`}>
                                                {u.Role}
                                            </span>
                                    </td>
                                    <td className="p-4">
                                            <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${u.Status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {u.Status}
                                            </span>
                                    </td>
                                    <td className="p-4 flex justify-end gap-2">
                                        <button
                                            onClick={() => handleInspectUser(u.ID)}
                                            className="px-3 py-1.5 rounded-xl border border-[color:var(--border)] hover:bg-[color:var(--background)] transition-colors flex items-center gap-1.5 text-xs font-bold text-indigo-500"
                                        >
                                            {isInspecting && selectedUserDetail?.user?.ID === u.ID ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Eye size={14} />
                                            )}
                                            Inspect Account
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Subscriptions Tab */}
                {activeTab === "subscriptions" && (
                    <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[color:var(--background)]/50 border-b border-[color:var(--border)]">
                            <tr>
                                <th className="p-4 font-semibold">Associated Account ID</th>
                                <th className="p-4 font-semibold">Tier Level Bracket</th>
                                <th className="p-4 font-semibold">Custom Credits</th>
                                <th className="p-4 font-semibold">Paddle Flow State</th>
                                <th className="p-4 font-semibold">Expiration Bound</th>
                                <th className="p-4 text-right">Overrides</th>
                            </tr>
                            </thead>
                            <tbody>
                            {subsList.map((sub) => {
                                const associatedUser = usersList.find(u => u.ID === sub.UserID);
                                const isMasterSub = associatedUser?.Email === MASTER_EMAIL;
                                const isEditing = editingSubId === sub.ID;

                                return (
                                    <tr key={sub.ID} className="border-b border-[color:var(--border)] last:border-0 hover:bg-[color:var(--background)]/30 transition-colors">
                                        <td className="p-4 font-mono text-xs text-[color:var(--muted-foreground)]">{sub.UserID}</td>
                                        <td className="p-4">
                                            {isEditing ? (
                                                <select
                                                    value={editTier}
                                                    onChange={(e) => setEditTier(e.target.value)}
                                                    className="bg-[var(--background)] border border-[color:var(--border)] rounded-lg p-1 text-xs outline-none text-[color:var(--foreground)]"
                                                >
                                                    <option value="free">Free Tier</option>
                                                    <option value="plus">Plus Tier</option>
                                                    <option value="pro">Pro Tier</option>
                                                </select>
                                            ) : (
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${sub.Tier === 'pro'
                                                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                                                    : sub.Tier === 'plus'
                                                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                                        : 'bg-neutral-800 text-neutral-400'
                                                }`}>
                                                        {sub.Tier}
                                                    </span>
                                            )}
                                        </td>
                                        <td className="p-4 font-bold text-amber-500 flex items-center gap-1.5">
                                            <Coins size={14} /> {sub.CustomCredits || 0}
                                        </td>
                                        <td className="p-4 capitalize">
                                            {isEditing ? (
                                                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="bg-[var(--background)] border border-[color:var(--border)] rounded-lg p-1 text-xs outline-none text-[color:var(--foreground)]">
                                                    <option value="active">Active</option>
                                                    <option value="canceled">Canceled</option>
                                                    <option value="past_due">Past Due</option>
                                                    <option value="expired">Expired</option>
                                                </select>
                                            ) : sub.Status}
                                        </td>
                                        <td className="p-4 font-mono text-xs">{sub.CurrentPeriodEnd ? new Date(sub.CurrentPeriodEnd).toLocaleDateString() : "-"}</td>
                                        <td className="p-4 text-right">
                                            {isMasterSub ? (
                                                <span className="text-xs text-indigo-500 font-bold px-2">Protected</span>
                                            ) : isEditing ? (
                                                <div className="flex justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handleSaveSubscription(sub.UserID, associatedUser?.Email || "")}
                                                        className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition"
                                                    >
                                                        <Save size={14} />
                                                    </button>
                                                    <button onClick={() => setEditingSubId(null)} className="p-1.5 bg-neutral-800 border border-[color:var(--border)] text-xs font-bold rounded-lg">Cancel</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setEditingSubId(sub.ID);
                                                        setEditTier(sub.Tier);
                                                        setEditStatus(sub.Status);
                                                        setEditCredits(sub.CustomCredits || 0);
                                                        setEditDays(0);
                                                    }}
                                                    className="p-1.5 bg-[color:var(--background)] border border-[color:var(--border)] rounded-lg hover:text-indigo-500 transition-colors"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Metrics Tab */}
                {activeTab === "metrics" && metrics && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-[var(--card)] p-6 rounded-2xl border border-[color:var(--border)] flex items-center gap-4">
                                <div className="p-4 bg-indigo-500/10 text-indigo-500 rounded-xl"><Users size={24} /></div>
                                <div>
                                    <p className="text-sm text-[color:var(--muted-foreground)] font-medium">Total Registered Users</p>
                                    <p className="text-2xl font-black">{metrics.total_users || 0}</p>
                                </div>
                            </div>
                            <div className="bg-[var(--card)] p-6 rounded-2xl border border-[color:var(--border)] flex items-center gap-4">
                                <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-xl"><CreditCard size={24} /></div>
                                <div>
                                    <p className="text-sm text-[color:var(--muted-foreground)] font-medium">Live Gross Revenue</p>
                                    <p className="text-2xl font-black">${(metrics.total_revenue || 0).toFixed(2)}</p>
                                </div>
                            </div>
                            <div className="bg-[var(--card)] p-6 rounded-2xl border border-[color:var(--border)] flex items-center gap-4">
                                <div className="p-4 bg-amber-500/10 text-amber-500 rounded-xl"><BarChart3 size={24} /></div>
                                <div>
                                    <p className="text-sm text-[color:var(--muted-foreground)] font-medium">Total Actions Processed</p>
                                    <p className="text-2xl font-black">
                                        {metrics.tool_usage?.reduce((acc: number, curr: any) => acc + curr.count, 0) || 0}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="bg-[var(--card)] p-6 rounded-2xl border border-[color:var(--border)] lg:col-span-2">
                                <h3 className="font-bold mb-6 flex items-center gap-2">
                                    <History size={18} className="text-indigo-500" /> 30-Day Activity Trend
                                </h3>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={metrics.daily_trend || []}>
                                            <defs>
                                                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                            <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                                            <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-[var(--card)] p-6 rounded-2xl border border-[color:var(--border)]">
                                <h3 className="font-bold mb-2 flex items-center gap-2">
                                    <CheckCircle size={18} className="text-emerald-500" /> Subscription Health
                                </h3>
                                <div className="h-64 flex items-center justify-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={metrics.sub_distribution || []}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="count"
                                                nameKey="status"
                                            >
                                                {(metrics.sub_distribution || []).map((entry: any, index: number) => {
                                                    const colors: Record<string, string> = {
                                                        active: '#10b981',
                                                        canceled: '#f59e0b',
                                                        past_due: '#ef4444',
                                                        expired: '#6b7280'
                                                    };
                                                    return <Cell key={`cell-${index}`} fill={colors[entry.status] || '#6366f1'} />;
                                                })}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap justify-center gap-3 text-xs mt-2">
                                    {(metrics.sub_distribution || []).map((d: any) => (
                                        <div key={d.status} className="flex items-center gap-1.5 capitalize font-medium">
                                            <span className={`w-3 h-3 rounded-full ${d.status === 'active' ? 'bg-emerald-500' : d.status === 'canceled' ? 'bg-amber-500' : d.status === 'past_due' ? 'bg-red-500' : 'bg-gray-500'}`}></span>
                                            {d.status}: {d.count}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--card)] p-6 rounded-2xl border border-[color:var(--border)]">
                            <h3 className="font-bold mb-6 flex items-center gap-2">
                                <BarChart3 size={18} className="text-indigo-500" /> Lifetime Tool Popularity
                            </h3>
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={metrics.tool_usage || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="tool_name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} cursor={{ fill: 'var(--background)' }} />
                                        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Inspect User Animated Side Panel Drawer (No Portal Required) */}
            {selectedUserDetail && (
                <div
                    className="fixed top-[72px] inset-x-0 bottom-0 z-[40] flex justify-end bg-black/60 backdrop-blur-sm"
                    style={{ animation: 'fadeIn 0.2s ease-out' }}
                    onClick={() => setSelectedUserDetail(null)}
                >
                    <div
                        className="w-full sm:w-[600px] h-full bg-[var(--card)] p-6 shadow-2xl overflow-y-auto border-l border-[color:var(--border)] flex flex-col space-y-6"
                        style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Panel Header */}
                        <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-4">
                            <div>
                                <h2 className="text-xl font-black flex items-center gap-2">
                                    <Info className="text-indigo-500" size={20} /> User Analytics Inspector
                                </h2>
                                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5 font-mono">{selectedUserDetail.user.ID}</p>
                            </div>
                            <button onClick={() => setSelectedUserDetail(null)} className="p-2 bg-[color:var(--background)] border border-[color:var(--border)] rounded-xl hover:text-indigo-500 transition">
                                <X size={18} />
                            </button>
                        </div>

                        {/* User Overview */}
                        <div className="bg-[color:var(--background)]/60 border border-[color:var(--border)] rounded-2xl p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-xs text-[color:var(--muted-foreground)] block font-medium">Email Target</span>
                                    <span className="font-bold text-md flex items-center gap-1.5 mt-0.5 break-all">
                                        {selectedUserDetail.user.Email}
                                        {selectedUserDetail.user.Email === MASTER_EMAIL && <ShieldCheck size={16} className="text-indigo-500 flex-shrink-0" />}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-xs text-[color:var(--muted-foreground)] block font-medium">Joined On</span>
                                    <span className="font-mono text-xs block mt-1">{new Date(selectedUserDetail.user.CreatedAt).toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="border-t border-[color:var(--border)] pt-4 flex flex-wrap gap-2">
                                <button
                                    onClick={() => handleBanToggle(selectedUserDetail.user.ID, selectedUserDetail.user.Email)}
                                    disabled={selectedUserDetail.user.Email === MASTER_EMAIL}
                                    className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40 ${
                                        selectedUserDetail.user.Status === 'active'
                                            ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20'
                                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20'
                                    }`}
                                >
                                    {selectedUserDetail.user.Status === 'active' ? <><Ban size={14} /> Ban Account</> : <><CheckCircle size={14} /> Lift Account Ban</>}
                                </button>

                                <button
                                    onClick={() => handleRoleChange(selectedUserDetail.user.ID, selectedUserDetail.user.Email, selectedUserDetail.user.Role)}
                                    disabled={selectedUserDetail.user.Email === MASTER_EMAIL}
                                    className="px-3 py-2 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] hover:text-indigo-500 transition text-xs font-bold disabled:opacity-40"
                                >
                                    Toggle Authorization Role ({selectedUserDetail.user.Role})
                                </button>
                            </div>
                        </div>

                        {/* Plan Config */}
                        <div className="border border-[color:var(--border)] bg-[var(--card)] rounded-2xl p-5 space-y-4">
                            <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-500">
                                <CreditCard size={16} /> Live Plan Configuration Overrides
                            </h3>
                            {selectedUserDetail.user.Email === MASTER_EMAIL ? (
                                <p className="text-xs text-emerald-500 font-bold bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl flex items-center gap-2">
                                    <ShieldCheck size={14} /> Master Administrator profile possesses absolute lifelong tier clearance exemptions.
                                </p>
                            ) : selectedUserDetail.subscription ? (
                                <div className="space-y-4 text-xs">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div>
                                            <label className="text-[color:var(--muted-foreground)] block mb-1">Quota Tier</label>
                                            <select
                                                value={editTier}
                                                onChange={(e) => setEditTier(e.target.value)}
                                                className="w-full bg-[color:var(--background)] border border-[color:var(--border)] rounded-xl p-2 outline-none text-xs text-[color:var(--foreground)]"
                                            >
                                                <option value="free">Free Plan (5/Day)</option>
                                                <option value="plus">Plus Plan (50/Day)</option>
                                                <option value="pro">Pro Plan (500/Day)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[color:var(--muted-foreground)] block mb-1">Paddle Status</label>
                                            <select
                                                value={editStatus}
                                                onChange={(e) => setEditStatus(e.target.value)}
                                                className="w-full bg-[color:var(--background)] border border-[color:var(--border)] rounded-xl p-2 outline-none text-xs text-[color:var(--foreground)]"
                                            >
                                                <option value="active">Active</option>
                                                <option value="canceled">Canceled</option>
                                                <option value="expired">Expired</option>
                                                <option value="past_due">Past Due</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[color:var(--muted-foreground)] block mb-1">Custom Credits</label>
                                            <input
                                                type="number"
                                                value={editCredits}
                                                onChange={(e) => setEditCredits(Number(e.target.value))}
                                                className="w-full bg-[color:var(--background)] border border-[color:var(--border)] rounded-xl p-2 outline-none text-xs font-bold text-[color:var(--foreground)]"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[color:var(--muted-foreground)] block mb-1">Add Time Window</label>
                                            <input
                                                type="number"
                                                placeholder="Days"
                                                onChange={(e) => setEditDays(Number(e.target.value))}
                                                className="w-full bg-[color:var(--background)] border border-[color:var(--border)] rounded-xl p-2 outline-none text-xs text-[color:var(--foreground)]"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleSaveSubscription(selectedUserDetail.user.ID, selectedUserDetail.user.Email)}
                                        className="w-full py-2.5 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition flex items-center justify-center gap-2 shadow-sm text-xs"
                                    >
                                        <Save size={14} /> Save Subscription Modifications
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs text-[color:var(--muted-foreground)]">No registration tier row found.</p>
                            )}
                        </div>

                        {/* Ledger History */}
                        <div className="space-y-3">
                            <h3 className="font-bold text-sm flex items-center gap-2">
                                <History size={16} className="text-indigo-500" /> Transaction Ledger History ({selectedUserDetail.transactions?.length || 0})
                            </h3>
                            <div className="max-h-40 overflow-y-auto border border-[color:var(--border)] rounded-xl text-xs bg-[var(--background)]">
                                {selectedUserDetail.transactions?.length === 0 ? (
                                    <p className="p-4 text-[color:var(--muted-foreground)] text-center">No transactions on record.</p>
                                ) : (
                                    <table className="w-full text-left">
                                        <thead className="bg-[color:var(--background)] sticky top-0 border-b border-[color:var(--border)]">
                                        <tr>
                                            <th className="p-3">Date</th>
                                            <th className="p-3">Amount</th>
                                            <th className="p-3 text-right">Reference Transaction ID</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {selectedUserDetail.transactions.map((tx: any) => (
                                            <tr key={tx.ID} className="border-b border-[color:var(--border)] last:border-0 hover:bg-[color:var(--card)]">
                                                <td className="p-3">{new Date(tx.CreatedAt).toLocaleDateString()}</td>
                                                <td className="p-3 font-bold text-emerald-500">{tx.Amount} {tx.Currency}</td>
                                                <td className="p-3 text-right font-mono text-[10px] text-[color:var(--muted-foreground)]">{tx.PaddleTransactionID}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                        {/* Activity Logs */}
                        <div className="space-y-3 flex-1 flex flex-col pb-4">
                            <h3 className="font-bold text-sm flex items-center gap-2">
                                <BarChart3 size={16} className="text-indigo-500" /> Recent Document Activity Logs ({selectedUserDetail.usage_logs?.length || 0})
                            </h3>
                            <div className="flex-1 max-h-56 overflow-y-auto border border-[color:var(--border)] rounded-xl text-xs bg-[var(--background)]">
                                {selectedUserDetail.usage_logs?.length === 0 ? (
                                    <p className="p-4 text-[color:var(--muted-foreground)] text-center">No operational logs captured within current parameters window.</p>
                                ) : (
                                    <table className="w-full text-left">
                                        <thead className="bg-[color:var(--background)] sticky top-0 border-b border-[color:var(--border)]">
                                        <tr>
                                            <th className="p-3">Timestamp</th>
                                            <th className="p-3">Tool Engine Module</th>
                                            <th className="p-3 text-right">Pages Count</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {selectedUserDetail.usage_logs.map((log: any) => (
                                            <tr key={log.ID} className="border-b border-[color:var(--border)] last:border-0 hover:bg-[color:var(--card)]">
                                                <td className="p-3 font-mono text-[11px] text-[color:var(--muted-foreground)]">{new Date(log.CreatedAt).toLocaleString()}</td>
                                                <td className="p-3 font-semibold text-indigo-400 capitalize">{log.ToolName}</td>
                                                <td className="p-3 text-right font-bold">{log.PagesCount || 1} Pages</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}