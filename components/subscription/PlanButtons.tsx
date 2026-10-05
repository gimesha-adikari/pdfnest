import React from "react";
import type {BillingPolicy} from "@/context/authSessionState";
import {canStartPurchase} from "@/lib/billingPolicyUi";

type BillingInterval = "monthly" | "yearly";

interface PlanButtonsProps {
    tier: "plus" | "pro";
    monthlyPrice: string;
    yearlyPrice: string;
    currentTier: string;
    isProcessing: boolean;
    billingPolicy: BillingPolicy | null;
    onUpgrade: (tier: "plus" | "pro", interval: BillingInterval) => void;
    trialText: string;
}

export default function PlanButtons({
                         tier,
                         monthlyPrice,
                         yearlyPrice,
                         currentTier,
                         isProcessing,
                         billingPolicy,
                         onUpgrade,
                         trialText,
                     }: PlanButtonsProps) {
    const purchasesEnabled = canStartPurchase(billingPolicy);

    const handleUpgrade = (interval: BillingInterval) => {
        if (!purchasesEnabled) return;
        onUpgrade(tier, interval);
    };

    return (
        <div className="space-y-2">
            {!purchasesEnabled && (
                <p role="status" className="text-xs text-center text-[color:var(--muted-foreground)]">
                    {billingPolicy?.mode === "free"
                        ? "New purchases are temporarily unavailable while processing is free."
                        : "Purchase availability is being checked. Refresh before starting checkout."}
                </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <button
                    onClick={() => handleUpgrade("monthly")}
                    disabled={!purchasesEnabled || isProcessing || currentTier === tier}
                    className="rounded-xl border border-border bg-background
                    px-4 py-3 text-left text-xs font-semibold text-foreground transition hover:border-indigo-500
                    hover:text-indigo-500 disabled:opacity-50"
                >
                    <div className="font-bold">Monthly</div>
                    <div>${monthlyPrice} / month</div>
                    {purchasesEnabled && <div className="text-[11px] font-medium text-indigo-500">{trialText}</div>}
                </button>

                <button
                    onClick={() => handleUpgrade("yearly")}
                    disabled={!purchasesEnabled || isProcessing || currentTier === tier}
                    className="rounded-xl border border-border bg-background px-4 py-3 text-left text-xs font-semibold
                    text-foreground transition hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-50"
                >
                    <div className="font-bold">Yearly</div>
                    <div>${yearlyPrice} / year</div>
                    {purchasesEnabled && <div className="text-[11px] font-medium text-indigo-500">{trialText}</div>}
                </button>
            </div>
            {purchasesEnabled && (
                <p className="text-[11px] text-[color:var(--muted)] font-medium text-center leading-tight">
                    7-day free trial. Then ${monthlyPrice}/month unless canceled before the trial ends.
                </p>
            )}
        </div>
    );
}
