"use client";

import React, {useEffect, useState} from "react";
import Link from "next/link";
import {useAuth} from "@/context/AuthContext";
import {fetchJson} from "@/lib/api";
import {ArrowUpRight, CheckCircle2, Coins, History, Loader2, Sparkles, Zap} from "lucide-react";
import {notify} from "@/lib/notify";

export default function UserDashboard() {
    const {isAuthenticated, isLoading, subscription, refreshSession} = useAuth();
    const [transactions, setTransactions] = useState<any[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [isBuyingCredits, setIsBuyingCredits] = useState(false);


    const creditPacks = [
        {credits: 10, price: 0.30},
        {credits: 20, price: 0.50},
        {credits: 50, price: 1.00},
        {credits: 100, price: 2.00},
        {credits: 200, price: 4.00},
        {credits: 500, price: 8.00},
    ];

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            // eslint-disable-next-line react-hooks/immutability
            fetchTransactions();
        }
    }, [isLoading, isAuthenticated]);

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
        setIsBuyingCredits(true);

        try {
            const res = await fetchJson<{ checkout_url: string }>("/billing/checkout-credits", {
                method: "POST",
                body: JSON.stringify({ credits: amount }),
            });

            if (!res.checkout_url) {
                throw new Error("Missing checkout URL.");
            }

            window.location.assign(res.checkout_url);
        } catch (err) {
            console.error(err);
            notify("Credit checkout failed.","error");
        } finally {
            setIsBuyingCredits(false);
        }
    };

    if (isLoading || isFetching) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2
            className="animate-spin text-indigo-500" size={32}/></div>;
    }

    if (!isAuthenticated || !subscription) return null;

    const currentTier = subscription.tier; // "free", "plus", "pro"
    const hasActiveSubscription = currentTier === "plus" || currentTier === "pro";

    const getTierLabel = () => {
        if (currentTier === "pro") return "Pro Tier";
        if (currentTier === "plus") return "Plus Tier";
        return "Free Tier";
    };

    const getDailyLimitText = () => {
        if (currentTier === "pro") return "500 processes per day";
        if (currentTier === "plus") return "50 processes per day";
        return "5 processes per day";
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                <div>
                    <h1 className="text-3xl font-black text-[color:var(--foreground)]">Account & Billing</h1>
                    <p className="text-[color:var(--muted-foreground)] mt-2">Manage your subscription tier level matrix
                        and add standalone credit buckets.</p>
                </div>

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
                                    : "Standard daily account allocation threshold capped at 5 files per day."}
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
                            <span className="text-sm">{getDailyLimitText()}</span>
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
                        <h3 className="text-xl font-extrabold text-[color:var(--foreground)] pt-1">Looking for higher
                            limits or Pro Studio?</h3>
                        <p className="text-xs text-[color:var(--muted-foreground)] leading-relaxed max-w-xl">
                            Unlock feature tiers including full entry to the Virtual Document Studio, priority server
                            queues, custom metadata adjustments, and higher batch thresholds.
                        </p>
                    </div>
                    <Link
                        href="/subscribe"
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all shrink-0 text-center"
                    >
                        View Tier Plans & Pricing
                    </Link>
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
                                <p className="text-sm text-[color:var(--muted-foreground)] mt-0.5">Purchased tokens used
                                    automatically if your daily tier quota gets exceeded.</p>
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