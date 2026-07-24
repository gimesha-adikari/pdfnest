"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchJson } from "@/lib/api";
import { notify } from "@/lib/notify";
import {
    Loader2,
    Shield,
    User,
    CreditCard,
    Trash2,
    Key,
    ExternalLink,
    Bell,
    Download,
    Languages,
    LogOut,
    Palette
} from "lucide-react";
import { useRouter } from "next/navigation";

type Preferences = {
    email_notifications: boolean;
    product_updates: boolean;
    billing_emails: boolean;
    security_alerts: boolean;
    theme: "system" | "light" | "dark";
    language: string;
};

type UsageSummary = {
    usedUnits3h: number;
    usedUnitsDaily: number;
    usedUnitsMonthly: number;
    currentPeriodEnd?: string;
};

type PreferencesResponse = {
    email_notifications: boolean;
    product_updates: boolean;
    billing_emails: boolean;
    security_alerts: boolean;
    theme: "system" | "light" | "dark";
    language: string;
};

export default function SettingsPage() {
    const { isAuthenticated, isLoading, user, subscription, logout } = useAuth();
    const router = useRouter();

    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSavingPreferences, setIsSavingPreferences] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [loadingPreferences, setLoadingPreferences] = useState(true);

    const [passwords, setPasswords] = useState({
        current: "",
        new: "",
        confirm: ""
    });

    const [preferences, setPreferences] = useState<Preferences>({
        email_notifications: true,
        product_updates: true,
        billing_emails: true,
        security_alerts: true,
        theme: "system",
        language: "en"
    });

    const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !user) return;

        const loadSettings = async () => {
            setLoadingPreferences(true);
            try {
                const data = await fetchJson<PreferencesResponse>("/user/settings/preferences");
                setPreferences({
                    email_notifications: data.email_notifications ?? true,
                    product_updates: data.product_updates ?? true,
                    billing_emails: data.billing_emails ?? true,
                    security_alerts: data.security_alerts ?? true,
                    theme: data.theme ?? "system",
                    language: data.language ?? "en"
                });

                if (subscription) {
                    setUsageSummary({
                        usedUnits3h: subscription.used_units_3h ?? 0,
                        usedUnitsDaily: subscription.used_units_daily ?? 0,
                        usedUnitsMonthly: subscription.used_units_monthly ?? 0,
                        currentPeriodEnd: subscription.current_period_end
                    });
                }
            } catch (err: any) {
                console.error(err);
                notify(err.message || "Failed to load settings", "error");
            } finally {
                setLoadingPreferences(false);
            }
        };

        loadSettings();
    }, [isAuthenticated, user, subscription]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    if (!isAuthenticated || !user) return null;

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (passwords.new !== passwords.confirm) {
            notify("New passwords do not match", "error");
            return;
        }

        if (passwords.new.length < 8) {
            notify("Password must be at least 8 characters", "error");
            return;
        }

        setIsUpdatingPassword(true);
        try {
            await fetchJson("/user/settings/password", {
                method: "PUT",
                body: JSON.stringify({
                    current_password: passwords.current,
                    new_password: passwords.new
                })
            });

            notify("Password updated successfully!", "success");
            setPasswords({ current: "", new: "", confirm: "" });
        } catch (err: any) {
            console.error(err);
            notify(err.message || "Failed to update password", "error");
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleSavePreferences = async () => {
        setIsSavingPreferences(true);
        try {
            await fetchJson("/user/settings/preferences", {
                method: "PUT",
                body: JSON.stringify(preferences)
            });
            notify("Preferences saved successfully!", "success");
        } catch (err: any) {
            console.error(err);
            notify(err.message || "Failed to save preferences", "error");
        } finally {
            setIsSavingPreferences(false);
        }
    };

    const handleExportData = async () => {
        setIsExporting(true);
        try {
            const response = await fetch("/api/user/settings/export", {
                method: "GET",
                credentials: "include"
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || "Failed to export data");
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "pdfnest-account-data.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            notify("Your data export is downloading now.", "success");
        } catch (err: any) {
            console.error(err);
            notify(err.message || "Failed to export data", "error");
        } finally {
            setIsExporting(false);
        }
    };

    const handleDeleteAccount = async () => {
        const typed = window.prompt(
            `Type your email address to confirm deletion:\n\n${user.email}`
        );

        if (!typed) return;

        if (typed.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
            notify("Email did not match. Account deletion cancelled.", "error");
            return;
        }

        setIsDeleting(true);
        try {
            await fetchJson("/user/account", { method: "DELETE" });
            notify("Account deleted.", "success");
            await logout();
            router.push("/");
        } catch (err: any) {
            notify(err.message || "Failed to delete account", "error");
            setIsDeleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-6 md:p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-3xl font-black text-[color:var(--foreground)]">Settings</h1>
                        <p className="text-[color:var(--muted-foreground)] mt-2">
                            Manage your account, billing, security, and preferences.
                        </p>
                    </div>

                    <button
                        onClick={() => logout().then(() => router.push("/"))}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] hover:border-indigo-500 transition text-sm font-bold"
                    >
                        <LogOut size={16} />
                        Logout
                    </button>
                </div>

                {/* Profile Information */}
                <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-4">
                        <User className="text-indigo-500" size={24} />
                        <h2 className="text-xl font-bold text-[color:var(--foreground)]">Profile Information</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                disabled
                                value={user.email}
                                className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] text-[color:var(--foreground)] opacity-70 cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Account Status
                            </label>
                            <div className="flex items-center h-[46px]">
                                <span className="px-3 py-1 text-xs font-bold uppercase rounded-md bg-emerald-500/10 text-emerald-500">
                                    {user.status || "Active"}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Login Method
                            </label>
                            <input
                                type="text"
                                disabled
                                value={user.google_id ? "Google" : "Email & Password"}
                                className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] text-[color:var(--foreground)] opacity-70 cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Email Verification
                            </label>
                            <div className="flex items-center h-[46px]">
                                <span
                                    className={`px-3 py-1 text-xs font-bold uppercase rounded-md ${
                                        user.email_verified
                                            ? "bg-emerald-500/10 text-emerald-500"
                                            : "bg-amber-500/10 text-amber-500"
                                    }`}
                                >
                                    {user.email_verified ? "Verified" : "Not Verified"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Subscription */}
                <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-4">
                        <CreditCard className="text-indigo-500" size={24} />
                        <h2 className="text-xl font-bold text-[color:var(--foreground)]">Subscription</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Current Plan
                            </label>
                            <input
                                type="text"
                                disabled
                                value={subscription?.tier || "free"}
                                className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] text-[color:var(--foreground)] opacity-70 cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Billing Interval
                            </label>
                            <input
                                type="text"
                                disabled
                                value={subscription?.billing_interval || "monthly"}
                                className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] text-[color:var(--foreground)] opacity-70 cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Subscription Status
                            </label>
                            <input
                                type="text"
                                disabled
                                value={subscription?.status || "free"}
                                className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] text-[color:var(--foreground)] opacity-70 cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                Renews / Expires
                            </label>
                            <input
                                type="text"
                                disabled
                                value={subscription?.current_period_end || "-"}
                                className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] text-[color:var(--foreground)] opacity-70 cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {usageSummary && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                                <div className="text-xs uppercase font-bold text-[color:var(--muted-foreground)]">3 Hour Usage</div>
                                <div className="text-2xl font-black mt-2">{usageSummary.usedUnits3h}</div>
                            </div>
                            <div className="p-4 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                                <div className="text-xs uppercase font-bold text-[color:var(--muted-foreground)]">Daily Usage</div>
                                <div className="text-2xl font-black mt-2">{usageSummary.usedUnitsDaily}</div>
                            </div>
                            <div className="p-4 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                                <div className="text-xs uppercase font-bold text-[color:var(--muted-foreground)]">Monthly Usage</div>
                                <div className="text-2xl font-black mt-2">{usageSummary.usedUnitsMonthly}</div>
                            </div>
                        </div>
                    )}

                    {(subscription?.update_url || subscription?.cancel_url) && (
                        <div className="flex flex-wrap gap-4">
                            {subscription?.update_url && (
                                <a
                                    href={subscription.update_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 bg-[var(--background)] border border-[color:var(--border)] rounded-xl text-sm font-bold hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm"
                                >
                                    Update Payment Details <ExternalLink size={14} />
                                </a>
                            )}
                            {subscription?.cancel_url && (
                                <a
                                    href={subscription.cancel_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 bg-[var(--background)] border border-[color:var(--border)] rounded-xl text-sm font-bold hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm"
                                >
                                    Manage Plan <ExternalLink size={14} />
                                </a>
                            )}
                        </div>
                    )}
                </div>

                {/* Security */}
                {!user.google_id ? (
                    <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 space-y-6">
                        <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-4">
                            <Shield className="text-indigo-500" size={24} />
                            <h2 className="text-xl font-bold text-[color:var(--foreground)]">Security</h2>
                        </div>

                        <form onSubmit={handlePasswordUpdate} className="space-y-4 max-w-md">
                            <div>
                                <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                    Current Password
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={passwords.current}
                                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                    className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] focus:border-indigo-500 outline-none transition"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                    New Password
                                </label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={passwords.new}
                                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                    className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] focus:border-indigo-500 outline-none transition"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                    Confirm New Password
                                </label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={passwords.confirm}
                                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                    className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] focus:border-indigo-500 outline-none transition"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isUpdatingPassword || !passwords.current || !passwords.new}
                                className="mt-4 flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50"
                            >
                                {isUpdatingPassword ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />}
                                Update Password
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 space-y-4">
                        <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-4">
                            <Shield className="text-indigo-500" size={24} />
                            <h2 className="text-xl font-bold text-[color:var(--foreground)]">Security</h2>
                        </div>
                        <p className="text-sm text-[color:var(--muted-foreground)]">
                            You signed in with Google, so password changes are managed through your Google Account.
                        </p>
                    </div>
                )}

                {/* Preferences */}
                <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-4">
                        <Bell className="text-indigo-500" size={24} />
                        <h2 className="text-xl font-bold text-[color:var(--foreground)]">Preferences</h2>
                    </div>

                    {loadingPreferences ? (
                        <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
                            <Loader2 className="animate-spin" size={16} />
                            Loading preferences...
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="flex items-center gap-3 p-4 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                                    <input
                                        type="checkbox"
                                        checked={preferences.email_notifications}
                                        onChange={(e) =>
                                            setPreferences({ ...preferences, email_notifications: e.target.checked })
                                        }
                                    />
                                    <span className="text-sm font-medium">Email notifications</span>
                                </label>

                                <label className="flex items-center gap-3 p-4 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                                    <input
                                        type="checkbox"
                                        checked={preferences.product_updates}
                                        onChange={(e) =>
                                            setPreferences({ ...preferences, product_updates: e.target.checked })
                                        }
                                    />
                                    <span className="text-sm font-medium">Product updates</span>
                                </label>

                                <label className="flex items-center gap-3 p-4 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                                    <input
                                        type="checkbox"
                                        checked={preferences.billing_emails}
                                        onChange={(e) =>
                                            setPreferences({ ...preferences, billing_emails: e.target.checked })
                                        }
                                    />
                                    <span className="text-sm font-medium">Billing emails</span>
                                </label>

                                <label className="flex items-center gap-3 p-4 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                                    <input
                                        type="checkbox"
                                        checked={preferences.security_alerts}
                                        onChange={(e) =>
                                            setPreferences({ ...preferences, security_alerts: e.target.checked })
                                        }
                                    />
                                    <span className="text-sm font-medium">Security alerts</span>
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                        Theme
                                    </label>
                                    <select
                                        value={preferences.theme}
                                        onChange={(e) =>
                                            setPreferences({
                                                ...preferences,
                                                theme: e.target.value as Preferences["theme"]
                                            })
                                        }
                                        className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] focus:border-indigo-500 outline-none transition"
                                    >
                                        <option value="system">System</option>
                                        <option value="light">Light</option>
                                        <option value="dark">Dark</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider block mb-2">
                                        Language
                                    </label>
                                    <select
                                        value={preferences.language}
                                        onChange={(e) =>
                                            setPreferences({ ...preferences, language: e.target.value })
                                        }
                                        className="w-full p-3 rounded-xl bg-[color:var(--background)] border border-[color:var(--border)] focus:border-indigo-500 outline-none transition"
                                    >
                                        <option value="en">English</option>
                                        <option value="si">Sinhala</option>
                                        <option value="ta">Tamil</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleSavePreferences}
                                disabled={isSavingPreferences}
                                className="flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50"
                            >
                                {isSavingPreferences ? <Loader2 size={18} className="animate-spin" /> : <Palette size={18} />}
                                Save Preferences
                            </button>
                        </div>
                    )}
                </div>

                {/* Data & Privacy */}
                <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-4">
                        <Languages className="text-indigo-500" size={24} />
                        <h2 className="text-xl font-bold text-[color:var(--foreground)]">Data & Privacy</h2>
                    </div>

                    <p className="text-sm text-[color:var(--muted-foreground)]">
                        Download your account data, usage history, and subscription summary.
                    </p>

                    <button
                        onClick={handleExportData}
                        disabled={isExporting}
                        className="flex items-center justify-center gap-2 bg-[var(--background)] border border-[color:var(--border)] hover:border-indigo-500 hover:text-indigo-500 px-6 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        Export My Data
                    </button>
                </div>

                {/* Danger Zone */}
                <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b border-red-500/20 pb-4">
                        <Trash2 className="text-red-500" size={24} />
                        <h2 className="text-xl font-bold text-red-500">Danger Zone</h2>
                    </div>

                    <p className="text-sm text-red-500/80">
                        Once you delete your account, there is no going back. All your uploaded documents,
                        usage history, and personal data will be permanently removed.
                    </p>

                    <button
                        onClick={handleDeleteAccount}
                        disabled={isDeleting}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl text-sm font-bold transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                        Permanently Delete Account
                    </button>
                </div>
            </div>
        </div>
    );
}