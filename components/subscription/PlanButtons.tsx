import React from "react";

type BillingInterval = "monthly" | "yearly";

interface PlanButtonsProps {
    tier: "plus" | "pro";
    monthlyPrice: string;
    yearlyPrice: string;
    currentTier: string;
    isProcessing: boolean;
    onUpgrade: (tier: "plus" | "pro", interval: BillingInterval) => void;
    trialText: string;
}

export default function PlanButtons({
                         tier,
                         monthlyPrice,
                         yearlyPrice,
                         currentTier,
                         isProcessing,
                         onUpgrade,
                         trialText,
                     }: PlanButtonsProps) {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <button
                onClick={() => onUpgrade(tier, "monthly")}
                disabled={isProcessing || currentTier === tier}
                className="rounded-xl border border-border bg-background
                px-4 py-3 text-left text-xs font-semibold text-foreground transition hover:border-indigo-500
                hover:text-indigo-500 disabled:opacity-50"
            >
                <div className="font-bold">Monthly</div>
                <div>${monthlyPrice} / month</div>
                <div>{trialText}</div>
            </button>

            <button
                onClick={() => onUpgrade(tier, "yearly")}
                disabled={isProcessing || currentTier === tier}
                className="rounded-xl border border-border bg-background px-4 py-3 text-left text-xs font-semibold
                text-foreground transition hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-50"
            >
                <div className="font-bold">Yearly</div>
                <div>${yearlyPrice} / year</div>
                <div>{trialText}</div>
            </button>
        </div>
    );
}
