import type {BillingPolicy} from "@/context/authSessionState";

/** New commerce is permitted only when the backend policy explicitly allows it. */
export function canStartPurchase(policy: BillingPolicy | null | undefined): boolean {
    return policy?.purchases_enabled === true;
}

/**
 * The site bridge waits while policy is unknown, opens in normal mode, and
 * drops checkout auto-launch in free mode.
 */
export function paddleTransactionPolicyDecision(
    policy: BillingPolicy | null | undefined
): "wait" | "open" | "discard" {
    if (policy == null) return "wait";
    return canStartPurchase(policy) ? "open" : "discard";
}
