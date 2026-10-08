"use client";

import React, {useEffect, useState} from "react";
import Link from "next/link";
import {useAuth} from "@/context/AuthContext";
import {fetchJson, type ClientError} from "@/lib/api";
import {openPaddleTransactionOverlay} from "@/lib/paddle";
import {ArrowUpRight, CheckCircle2, Coins, History, Loader2, Sparkles, Zap, Settings} from "lucide-react";
import {notify, notifyBackendError} from "@/lib/notify";
import StudioSessions from "@/components/dashboard/StudioSessions";
import { useTools } from "@/context/ToolContext";
import { TOTAL_TOOL_COUNT } from "@/lib/toolsData";
import {canStartPurchase} from "@/lib/billingPolicyUi";

export default function UserDashboard() {
    const {
        isLoggedIn,
        isLoading,
        subscription,
        billingPolicy,
        refreshSession,
    } = useAuth();
    const { totalCount } = useTools();
    const resolvedToolCount = totalCount || TOTAL_TOOL_COUNT;
    const [transactions, setTransactions] = useState<any[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [isBuyingCredits, setIsBuyingCredits] = useState(false);
    const purchasesEnabled = canStartPurchase(billingPolicy);
    const isFreeOperatingMode = billingPolicy?.mode === "free";


    const creditPacks = [
        {credits: 10, price: 0.70},
        {credits: 20, price: 1.40},
        {credits: 50, price: 2.00},
        {credits: 100, price: 4.00},
        {credits: 200, price: 6.00},
        {credits: 500, price: 10.00},
    ];

    useEffect(() => {
        if (!isLoading && isLoggedIn) {
            if (isFreeOperatingMode) {
                // No payment history request is needed for the free-first dashboard.
                setIsFetching(false);
            } else {
                // eslint-disable-next-line react-hooks/immutability
                fetchTransactions();
            }
        }
    }, [isLoading, isLoggedIn, isFreeOperatingMode]);

    const fetchTransactions = async () => {
        try {
            const data = await fetchJson("/billing/transactions");
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            setTransactions(data || []);
        } catch (err) {
            console.error("Failed to fetch transactions", err);
        } finally {
            setIsFetching(false);
        }
    };

    const handleBuyCredits = async (amount: number) => {
        if (!purchasesEnabled) return;
        setIsBuyingCredits(true);

        try {
            const res = await fetchJson<{ checkout_url: string }>("/billing/checkout-credits", {
                method: "POST",
                body: JSON.stringify({ credits: amount }),
            });

            if (!res.checkout_url) {
                throw new Error("Missing checkout URL.");
            }

            // Open the Paddle checkout as an overlay (no full-page navigation).
            // This prevents the BILL-001 regression where the hosted Paddle page
            // would redirect to "/" on cancel because no return URL was configured.
            await openPaddleTransactionOverlay(res.checkout_url, billingPolicy);
        } catch (err) {
            console.error(err);
            const backendError = (err as ClientError)?.billing;
            if (backendError?.code === "PURCHASES_DISABLED") {
                await refreshSession();
                notifyBackendError(backendError);
                return;
            }
            notify("Credit checkout failed. Please try again.", "error");
        } finally {
            setIsBuyingCredits(false);
        }
    };

    if (isLoading || isFetching) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2
            className="animate-spin text-indigo-500" size={32}/></div>;
    }

    if (!isLoggedIn || !subscription) return null;

    if (isFreeOperatingMode) {
        return (
            <main className="min-h-screen bg-[var(--background)] p-6 md:p-8 text-[var(--foreground)]">
                <div className="mx-auto max-w-4xl space-y-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black">Your PDF workspace</h1>
                            <p className="mt-2 text-sm text-[var(--muted)]">Everything you need to work with PDFs, in one place.</p>
                        </div>
                        <Link href="/dashboard/settings" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm font-bold hover:border-indigo-500">
                            <Settings size={18} /> Account Settings
                        </Link>
                    </div>
                    <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 md:p-8">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 size={24} className="text-emerald-500" />
                            <h2 className="text-xl font-extrabold">Free PDF processing</h2>
                        </div>
                        <p role="status" className="mt-3 text-sm text-[var(--muted)]">Cloud processing is currently free for everyone. No subscription or purchased credits are needed for supported tools. Technical and safety limits still apply.</p>
                        <Link href="/tools" className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Explore free tools</Link>
                    </section>
                    {subscription.tier !== "free" && (
                        <p className="text-sm text-[var(--muted)]">Have an existing paid subscription? You can manage or cancel it in <Link href="/dashboard/settings#billing" className="font-semibold underline">Account Settings</Link>.</p>
                    )}
                    <StudioSessions compact />
                </div>
            </main>
        );
    }

    const currentTier = subscription.tier;
    const hasActiveSubscription = currentTier === "plus" || currentTier === "pro";

    const getTierLabel = () => {
        if (currentTier === "pro") return "Pro Tier";
        if (currentTier === "plus") return "Plus Tier";
        return "Free Tier";
    };

    const getDailyLimitText = () => {
        if (currentTier === "pro") return "400 daily processing units (150 per 3-hour window)";
        if (currentTier === "plus") return "100 daily processing units (50 per 3-hour window)";
        return "20 daily processing units (8 per 3-hour window)";
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Dashboard Header with Settings Link */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-[color:var(--foreground)]">Account & Billing</h1>
                        <p className="text-[color:var(--muted-foreground)] mt-2">
                            {isFreeOperatingMode
                                ? "Your stored subscription and billing history remain available. Processing is currently free for everyone."
                                : "Manage your subscription capacity plan and add standalone credit buckets."}
                        </p>
                    </div>
                    <Link
                        href="/dashboard/settings"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm font-bold text-[color:var(--foreground)] hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm shrink-0"
                    >
                        <Settings size={18} />
                        Account Settings
                    </Link>
                </div>

                <StudioSessions compact />

                {/* Main Plan Overview Status Display Card */}
                <div
                    className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 relative overflow-hidden">
                    {hasActiveSubscription && (
                        <div
                            className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                    )}

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--muted-foreground)] uppercase tracking-wider mb-2">Current
                                Active Level</p>
                            <h2 className="text-4xl font-black flex items-center gap-3">
                                {getTierLabel()}
                                {hasActiveSubscription &&
                                    <Zap className="text-indigo-500 fill-indigo-500/20" size={28}/>}
                            </h2>
                            <p className="text-sm mt-3 text-[color:var(--muted-foreground)]">
                                {hasActiveSubscription
                                    ? `Your subscription is active. Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}.`
                                    : isFreeOperatingMode
                                        ? "Cloud processing is currently free for everyone. Technical and safety limits still apply."
                                        : `Standard daily account allocation: 20 processing units per day across all ${resolvedToolCount}+ tools.`}
                            </p>

                            {hasActiveSubscription && (subscription.update_url || subscription.cancel_url) && (
                                <div className="mt-5 flex flex-wrap gap-3">
                                    {subscription.update_url && (
                                        <a href={subscription.update_url} target="_blank" rel="noopener noreferrer"
                                           className="px-4 py-2 bg-[var(--background)] border border-[color:var(--border)] rounded-xl text-sm font-bold hover:border-indigo-500 hover:text-indigo-500 transition-colors shadow-sm">
                                            Update Payment Method
                                        </a>
                                    )}
                                    {subscription.cancel_url && (
                                        <a href={subscription.cancel_url} target="_blank" rel="noopener noreferrer"
                                           className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-bold hover:bg-red-500/20 transition-colors shadow-sm">
                                            Cancel Plan
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[color:var(--border)] pt-8">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="text-emerald-500" size={20}/>
                            <span className="text-sm">
                                {isFreeOperatingMode
                                    ? "Cloud processing is currently free for everyone."
                                    : billingPolicy?.processing_unit_limits_enforced
                                        ? getDailyLimitText()
                                        : "Processing allowance is unavailable until billing policy is confirmed."}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="text-emerald-500" size={20}/>
                            <span className="text-sm">Secure local-first processing environment</span>
                        </div>
                    </div>
                </div>

                {/* REPLACED: Contextual Subscription Tier Callout Card Routing to Subscription Page */}
                <div
                    className="bg-gradient-to-br from-[var(--card)] to-indigo-500/[0.03] border border-indigo-500/20 rounded-3xl p-8 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <span
                            className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest bg-indigo-500 text-white px-2.5 py-1 rounded-md uppercase">
                            <Sparkles size={10}/> Plans Comparison
                        </span>
                        <h3 className="text-xl font-extrabold text-[color:var(--foreground)] pt-1">
                            {isFreeOperatingMode ? "Processing is currently free for everyone." : "Looking for higher processing capacity?"}
                        </h3>
                        <p className="text-xs text-[color:var(--muted-foreground)] leading-relaxed max-w-xl">
                            {isFreeOperatingMode
                                ? "Existing subscriptions remain active and manageable from account settings."
                                : billingPolicy
                                    ? "Upgrade your plan for higher 3-hour burst and daily unit allowances to process multi-page documents, batch OCR, and high-volume workflows without interruptions."
                                    : "Purchase options are unavailable until the current billing policy is confirmed."}
                        </p>
                    </div>
                    {purchasesEnabled && (
                        <Link
                            href="/subscribe"
                            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all shrink-0 text-center"
                        >
                            View Tier Plans & Pricing
                        </Link>
                    )}
                </div>

                {/* Standalone Extra Credit Buying Module */}
                <div className="bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-4 bg-amber-500/10 text-amber-500 rounded-2xl">
                                <Coins size={28}/>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-[color:var(--foreground)]">Custom Package
                                    Credits</h3>
                                <p className="text-sm text-[color:var(--muted-foreground)] mt-0.5">
                                    {isFreeOperatingMode
                                        ? "Your stored credit balance remains in your account. Processing is currently free."
                                        : "Purchased tokens are used automatically if your daily tier quota gets exceeded."}
                                </p>
                            </div>
                        </div>
                        <div className="text-left sm:text-right">
                            <span
                                className="text-3xl font-black text-amber-500">{subscription.custom_credits || 0}</span>
                            <span
                                className="text-xs text-[color:var(--muted-foreground)] block font-bold uppercase tracking-wider mt-0.5">Available Balance</span>
                        </div>
                    </div>

                    <div className="border-t border-[color:var(--border)] pt-4">
                        {purchasesEnabled ? (
                            <>
                                <p className="text-xs font-bold text-[color:var(--muted-foreground)] uppercase tracking-wider mb-3">
                                    Top Up Document Credits
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {creditPacks.map((pack) => (
                                <button
                                    key={pack.credits}
                                    disabled={isBuyingCredits}
                                    onClick={() => handleBuyCredits(pack.credits)}
                                    className="p-3 bg-[color:var(--background)] border border-[color:var(--border)] rounded-xl flex items-center justify-between hover:border-amber-500/50 transition font-medium group text-xs text-left disabled:opacity-60"
                                >
                                    <div>
                    <span className="font-bold block text-[color:var(--foreground)]">
                        {pack.credits} Credits Pack
                    </span>

                                        <span className="text-[11px] text-[color:var(--muted-foreground)]">
                        ${pack.price.toFixed(2)} One-off
                    </span>
                                    </div>

                                    <ArrowUpRight
                                        size={14}
                                        className="text-[color:var(--muted-foreground)] group-hover:text-amber-500 transition-colors"
                                    />
                                </button>
                            ))}
                                </div>
                            </>
                        ) : (
                            <p role="status" className="border-t border-[color:var(--border)] pt-4 text-sm text-[color:var(--muted-foreground)]">
                                {isFreeOperatingMode
                                    ? "Credit top-ups are temporarily unavailable. No purchase is needed for supported processing."
                                    : "Credit purchases are unavailable until billing policy is confirmed."}
                            </p>
                        )}
                    </div>
                </div>

                {/* Payment History Section */}
                <div>
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <History size={20} className="text-indigo-500"/> Payment History
                    </h3>

                    {transactions.length === 0 ? (
                        <div
                            className="bg-[var(--card)] border border-[color:var(--border)] rounded-2xl p-8 text-center text-[color:var(--muted-foreground)]">
                            No past transactions found.
                        </div>
                    ) : (
                        <div
                            className="bg-[var(--card)] border border-[color:var(--border)] rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead
                                    className="bg-[color:var(--background)]/50 border-b border-[color:var(--border)]">
                                <tr>
                                    <th className="p-4 font-semibold">Date</th>
                                    <th className="p-4 font-semibold">Amount</th>
                                    <th className="p-4 font-semibold">Status</th>
                                    <th className="p-4 font-semibold font-mono text-xs text-right">Transaction ID</th>
                                </tr>
                                </thead>
                                <tbody>
                                {transactions.map((tx) => (
                                    <tr key={tx.ID}
                                        className="border-b border-[color:var(--border)] last:border-0 hover:bg-[color:var(--background)]/50">
                                        <td className="p-4">{new Date(tx.CreatedAt).toLocaleDateString()}</td>
                                        <td className="p-4 font-semibold">{tx.Amount} {tx.Currency}</td>
                                        <td className="p-4">
                                                <span
                                                    className="px-2 py-1 rounded-md text-xs font-bold uppercase bg-emerald-500/10 text-emerald-500">
                                                    {tx.Status}
                                                </span>
                                        </td>
                                        <td className="p-4 text-right font-mono text-xs text-[color:var(--muted-foreground)]">
                                            {tx.PaddleTransactionID}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
