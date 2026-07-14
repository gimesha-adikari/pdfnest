"use client";

import React, {useEffect, useState} from "react";
import Link from "next/link";
import {useAuth} from "@/context/AuthContext";
import {fetchJson} from "@/lib/api";
import {ArrowUpRight, CheckCircle2, ChevronDown, Eye, HelpCircle, Layout, Sparkles, Zap,} from "lucide-react";
import {fallbackSubscribeContent, SubscribeContent} from "@/lib/contentSubscribe";
import PlanButtons from "@/components/subscription/PlanButtons";
import {notify} from "@/lib/notify";

type BillingInterval = "monthly" | "yearly";

interface CheckoutResponse {
    checkout_url: string;
}

export default function SubscribePage() {
    const {isAuthenticated, subscription, requireAuth} = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeFaq, setActiveFaq] = useState<number | null>(null);
    const [content, setContent] = useState<SubscribeContent>(fallbackSubscribeContent);

    const currentTier = subscription?.tier || "free";
    const isGuest = !isAuthenticated;

    useEffect(() => {
        fetchJson("/site-content/subscribe")
            .then((data: any) => {
                if (data && typeof data === "object" && !("error" in data)) {
                    setContent((prev) => ({...prev, ...data}));
                }
            })
            .catch((err) => console.error("Error loading subscription settings:", err));
    }, []);

    const handlePlanUpgrade = async (tierName: "plus" | "pro", interval: BillingInterval) => {
        requireAuth(async () => {
            setIsProcessing(true);

            try {
                const res = await fetchJson<CheckoutResponse>("/billing/checkout", {
                    method: "POST",
                    body: JSON.stringify({
                        tier: tierName,
                        interval,
                    }),
                });

                if (!res.checkout_url) {
                    throw new Error("Missing checkout URL from server.");
                }

                window.location.assign(res.checkout_url);
            } catch (error) {
                console.error("Checkout error:", error);

                if (error instanceof Error) {
                    notify(error.message,"error");
                } else {
                    notify("Unable to start checkout. Please try again.","error");
                }
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const getBullets = (str: string) => (str ? str.split(",") : []);

    const dynamicFaqs = (() => {
        try {
            return JSON.parse(content.faqsJson);
        } catch {
            return JSON.parse(fallbackSubscribeContent.faqsJson);
        }
    })();


    const plusMonthlyPrice = content.plusMonthlyPrice || "4.99";
    const plusYearlyPrice = content.plusYearlyPrice || "49.99";
    const proMonthlyPrice = content.proMonthlyPrice || "9.99";
    const proYearlyPrice = content.proYearlyPrice || "99.99";

    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] pb-24">
            <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 select-none">
                <div
                    className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:60px_60px]"/>
                <div
                    className="animate-glow-slow absolute -top-40 -left-40 h-[800px] w-[800px] rounded-full bg-indigo-500/15 dark:bg-indigo-500/10 blur-[150px]"/>
                <div
                    className="animate-glow-medium absolute top-40 right-0 h-[700px] w-[700px] rounded-full bg-purple-500/15 dark:bg-purple-500/10 blur-[150px]"/>
            </div>

            <section className="mx-auto max-w-7xl px-6 py-4">
                <header className="mx-auto mt-16 max-w-3xl text-center flex flex-col items-center">
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-500 shadow-sm backdrop-blur-md mb-6">
                        <Sparkles size={12} className="animate-pulse"/> {content.heroBadge}
                    </span>

                    <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]">
                        {content.heroTitle} <br/>
                        <span
                            className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_2px_40px_rgba(99,102,241,0.2)] select-none">
                            {content.heroTitleGradient}
                        </span>
                    </h1>

                    <p className="mt-6 text-sm sm:text-base max-w-xl leading-relaxed text-[color:var(--muted)] font-medium">
                        {content.heroSubtitle}
                    </p>

                    <div className="mt-8 flex items-center justify-center gap-4">
                        <a
                            href="#plans"
                            className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-3 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all"
                        >
                            View Plans
                        </a>
                        <a
                            href="#features"
                            className="rounded-xl bg-[var(--card)] border border-[color:var(--border)] px-5 py-3 text-xs font-bold text-[color:var(--foreground)] hover:border-[color:var(--muted)] transition-all"
                        >
                            Compare Features
                        </a>
                    </div>
                </header>

                <div id="features" className="mt-24 max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-2xl font-black tracking-tight">{content.premiumSectionTitle}</h2>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        <div
                            className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/40 p-6 backdrop-blur-md">
                            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl w-fit mb-4">
                                <Layout size={20}/>
                            </div>
                            <h3 className="font-extrabold text-md text-[color:var(--foreground)]">{content.studioTitle}</h3>
                            <p className="text-xs text-[color:var(--muted)] mt-2 leading-relaxed">{content.studioDescription}</p>
                            <ul className="mt-4 space-y-2 text-xs font-semibold text-[color:var(--muted-foreground)]">
                                {getBullets(content.studioBulletPoints).map((pt, i) => (
                                    <li key={i} className="flex items-center gap-2">✓ {pt}</li>
                                ))}
                            </ul>
                        </div>

                        <div
                            className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/40 p-6 backdrop-blur-md">
                            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl w-fit mb-4">
                                <Eye size={20}/>
                            </div>
                            <h3 className="font-extrabold text-md text-[color:var(--foreground)]">{content.canvasTitle}</h3>
                            <p className="text-xs text-[color:var(--muted)] mt-2 leading-relaxed">{content.canvasDescription}</p>
                            <ul className="mt-4 space-y-2 text-xs font-semibold text-[color:var(--muted-foreground)]">
                                {getBullets(content.canvasBulletPoints).map((pt, i) => (
                                    <li key={i} className="flex items-center gap-2">✓ {pt}</li>
                                ))}
                            </ul>
                        </div>

                        <div
                            className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/40 p-6 backdrop-blur-md">
                            <div className="p-3 bg-pink-500/10 text-pink-500 rounded-xl w-fit mb-4">
                                <Zap size={20}/>
                            </div>
                            <h3 className="font-extrabold text-md text-[color:var(--foreground)]">{content.speedTitle}</h3>
                            <p className="text-xs text-[color:var(--muted)] mt-2 leading-relaxed">{content.speedDescription}</p>
                            <ul className="mt-4 space-y-2 text-xs font-semibold text-[color:var(--muted-foreground)]">
                                {getBullets(content.speedBulletPoints).map((pt, i) => (
                                    <li key={i} className="flex items-center gap-2">✓ {pt}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                <div id="plans" className="mt-24 grid gap-8 md:grid-cols-3 max-w-6xl mx-auto items-stretch">
                    <div
                        className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-xl p-8 flex flex-col justify-between transition-all">
                        <div>
                            <h3 className="text-xl font-extrabold capitalize text-[color:var(--foreground)]">{content.freeTitle}</h3>
                            <div className="flex items-baseline gap-1 my-4">
                                <span className="text-4xl font-black">${content.freePrice}</span>
                            </div>
                            <p className="text-xs text-[color:var(--muted)] font-medium mb-6">{content.freeSubtitle}</p>
                            <hr className="border-[color:var(--border)] my-4"/>
                            <ul className="space-y-3 mb-8">
                                {getBullets(content.freeBulletPoints).map((pt, i) => (
                                    <li
                                        key={i}
                                        className={`flex items-start gap-2 text-xs ${i === getBullets(content.freeBulletPoints).length - 1 ? "font-bold text-[color:var(--foreground)] mt-4" : "font-medium text-[color:var(--muted)]"}`}
                                    >
                                        {i < getBullets(content.freeBulletPoints).length - 1 && (
                                            <CheckCircle2 size={14} className="text-indigo-500 mt-0.5 shrink-0"/>
                                        )}
                                        {pt}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <button
                            disabled
                            className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-neutral-800 text-neutral-500 opacity-60"
                        >
                            {currentTier === "free" && !isGuest ? "Current Plan" : "Free Plan Included"}
                        </button>
                    </div>

                    <div
                        className={`rounded-3xl border bg-[var(--card)]/50 backdrop-blur-xl p-8 flex flex-col justify-between transition-all ${
                            currentTier === "plus" ? "border-indigo-500 ring-1 ring-indigo-500/20" : "border-[color:var(--border)]"
                        }`}
                    >
                        <div>
                            <h3 className="text-xl font-extrabold capitalize text-[color:var(--foreground)]">{content.plusTitle}</h3>
                            <div className="flex items-baseline gap-1 my-4">
                                <span className="text-4xl font-black">${plusMonthlyPrice}</span>
                                <span className="text-xs text-[color:var(--muted)]">/month</span>
                            </div>
                            <p className="text-xs text-[color:var(--muted)] font-medium mb-6">{content.plusSubtitle}</p>
                            <hr className="border-[color:var(--border)] my-4"/>
                            <ul className="space-y-3 mb-8">
                                {getBullets(content.plusBulletPoints).map((pt, i) => (
                                    <li key={i}
                                        className="flex items-start gap-2 text-xs font-medium text-[color:var(--muted)]">
                                        <CheckCircle2 size={14} className="text-indigo-500 mt-0.5 shrink-0"/> {pt}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <PlanButtons
                            tier="plus"
                            monthlyPrice={plusMonthlyPrice}
                            yearlyPrice={plusYearlyPrice}
                            currentTier={currentTier}
                            isProcessing={isProcessing}
                            trialText={content.trialText}
                            onUpgrade={handlePlanUpgrade}
                        />
                    </div>

                    <div
                        className="rounded-3xl border-2 border-indigo-500 bg-[var(--card)] backdrop-blur-xl p-8 flex flex-col justify-between transition-all shadow-2xl relative scale-105 md:-translate-y-2 z-10">
                        <span
                            className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[10px] font-black tracking-widest px-4 py-1 rounded-full uppercase shadow-md">
                            RECOMMENDED
                        </span>

                        <div>
                            <div className="flex justify-between items-start">
                                <h3 className="text-xl font-extrabold capitalize text-[color:var(--foreground)]">{content.proTitle}</h3>
                                <span
                                    className="bg-indigo-500/10 text-indigo-500 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border border-indigo-500/20">
                                    MOST POWERFUL
                                </span>
                            </div>
                            <div className="flex items-baseline gap-1 my-4">
                                <span className="text-4xl font-black">${proMonthlyPrice}</span>
                                <span className="text-xs text-[color:var(--muted)]">/month</span>
                            </div>
                            <p className="text-xs text-[color:var(--muted)] font-medium mb-6">{content.proSubtitle}</p>
                            <hr className="border-[color:var(--border)] my-4"/>
                            <ul className="space-y-3 mb-8">
                                {getBullets(content.proBulletPoints).map((pt, i) => (
                                    <li key={i}
                                        className="flex items-start gap-2 text-xs font-medium text-[color:var(--muted)]">
                                        <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0"/> {pt}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <PlanButtons
                            tier="pro"
                            monthlyPrice={proMonthlyPrice}
                            yearlyPrice={proYearlyPrice}
                            currentTier={currentTier}
                            isProcessing={isProcessing}
                            trialText={content.trialText}
                            onUpgrade={handlePlanUpgrade}
                        />
                    </div>
                </div>

                <div className="mt-28 border-t border-[color:var(--border)] pt-20 max-w-4xl mx-auto text-center">
                    <h3 className="text-xl font-black tracking-tight mb-2">{content.securityTitle}</h3>
                    <p className="text-xs text-[color:var(--muted)] max-w-lg mx-auto font-medium">{content.securitySubtitle}</p>
                    <div
                        className="grid gap-4 sm:grid-cols-4 text-center mt-10 font-bold text-xs text-[color:var(--muted-foreground)]">
                        {getBullets(content.securityTags).map((tag, i) => (
                            <div key={i}
                                 className="p-4 bg-[var(--card)]/30 border border-[color:var(--border)] rounded-2xl">
                                ✓ {tag}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-28 border-t border-[color:var(--border)] pt-20 max-w-3xl mx-auto">
                    <h3 className="text-2xl font-black text-center mb-10 tracking-tight flex items-center justify-center gap-2">
                        <HelpCircle size={20} className="text-indigo-500"/> General FAQ
                    </h3>

                    <div className="space-y-4">
                        {dynamicFaqs.map((faq: any, index: number) => {
                            const isOpen = activeFaq === index;
                            return (
                                <div key={index}
                                     className="border border-[color:var(--border)] bg-[var(--card)]/30 rounded-2xl overflow-hidden">
                                    <button
                                        onClick={() => setActiveFaq(isOpen ? null : index)}
                                        className="w-full flex items-center justify-between p-5 text-left font-bold text-xs sm:text-sm text-[color:var(--foreground)] outline-none hover:bg-[color:var(--background)]/40 transition"
                                    >
                                        <span>{faq.q}</span>
                                        <ChevronDown
                                            size={16}
                                            className={`text-[color:var(--muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>
                                    <div
                                        className={`transition-all duration-200 overflow-hidden ${
                                            isOpen ? "max-h-40 border-t border-[color:var(--border)] p-5 bg-[color:var(--background)]/20" : "max-h-0"
                                        }`}
                                    >
                                        <p className="text-xs sm:text-sm text-[color:var(--muted)] leading-relaxed font-medium">{faq.a}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div
                    className="mt-28 max-w-4xl mx-auto bg-gradient-to-br from-[var(--card)] to-indigo-500/5 border border-indigo-500/20 rounded-3xl p-8 backdrop-blur-md text-center">
                    {isGuest && (
                        <>
                            <h3 className="text-xl font-black text-[color:var(--foreground)]">{content.ctaGuestTitle}</h3>
                            <Link
                                href="/login"
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-xs font-bold text-white transition-transform hover:scale-[1.02]"
                            >
                                Get Started Free <ArrowUpRight size={14}/>
                            </Link>
                        </>
                    )}

                    {!isGuest && currentTier === "free" && (
                        <>
                            <h3 className="text-xl font-black text-[color:var(--foreground)]">{content.ctaFreeTitle}</h3>
                            <p className="text-xs text-[color:var(--muted)] mt-1 font-medium">{content.ctaFreeSubtitle}</p>
                            <a
                                href="#plans"
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-xs font-bold text-white transition-transform hover:scale-[1.02]"
                            >
                                Upgrade to Plus or Pro
                            </a>
                        </>
                    )}

                    {!isGuest && currentTier === "plus" && (
                        <>
                            <h3 className="text-xl font-black text-[color:var(--foreground)]">{content.ctaPlusTitle}</h3>
                            <p className="text-xs text-[color:var(--muted)] mt-1 font-medium">{content.ctaPlusSubtitle}</p>
                            <button
                                onClick={() => handlePlanUpgrade("pro", "monthly")}
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-xs font-bold text-white transition-transform hover:scale-[1.02]"
                            >
                                Upgrade to Pro Workspace
                            </button>
                        </>
                    )}

                    {!isGuest && currentTier === "pro" && (
                        <>
                            <h3 className="text-xl font-black text-[color:var(--foreground)]">{content.ctaProTitle}</h3>
                            <p className="text-xs text-[color:var(--muted)] mt-1 font-medium">{content.ctaProSubtitle}</p>
                            <Link
                                href="/studio"
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-xs font-bold text-white transition-transform hover:scale-[1.02]"
                            >
                                Open Studio Workspace <ArrowUpRight size={14}/>
                            </Link>
                        </>
                    )}
                </div>
            </section>
        </main>
    );
}