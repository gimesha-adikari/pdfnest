export type BillingMode = "normal" | "free";

export interface BillingPolicy {
    mode: BillingMode;
    processing_unit_limits_enforced: boolean;
    purchases_enabled: boolean;
}

export interface SubscriptionStatus {
    role: string;
    tier: "free" | "plus" | "pro";
    status: string;
    billing_interval: "monthly" | "yearly";
    current_period_end: string;
    custom_credits: number;
    used_units_3h: number;
    used_units_daily: number;
    used_units_monthly: number;
    update_url?: string;
    cancel_url?: string;
}

export interface User {
    id: string;
    email: string;
    role: string;
    status?: string;
    google_id?: string | null;
    email_verified?: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface Guest {
    id: string;
    trust: number;
    created_at?: string;
    last_seen_at?: string;
}

export interface SessionResponse {
    authenticated: boolean;
    type: "guest" | "user";
    user?: User | null;
    guest?: Guest | null;
    subscription?: SubscriptionStatus | null;
    billing_policy?: BillingPolicy | null;
}

export interface AuthSessionState {
    user: User | null;
    guest: Guest | null;
    subscription: SubscriptionStatus | null;
    billingPolicy: BillingPolicy | null;
}

export type AuthSessionAction =
    | { type: "apply"; session: SessionResponse }
    | { type: "clear" };

export const initialAuthSessionState: AuthSessionState = {
    user: null,
    guest: null,
    subscription: null,
    billingPolicy: null,
};

function parseBillingPolicy(value: unknown): BillingPolicy | null {
    if (typeof value !== "object" || value === null) return null;
    const policy = value as Record<string, unknown>;
    if (
        (policy.mode !== "normal" && policy.mode !== "free") ||
        typeof policy.processing_unit_limits_enforced !== "boolean" ||
        typeof policy.purchases_enabled !== "boolean"
    ) {
        return null;
    }

    return {
        mode: policy.mode,
        processing_unit_limits_enforced: policy.processing_unit_limits_enforced,
        purchases_enabled: policy.purchases_enabled,
    };
}

export function authSessionReducer(_state: AuthSessionState, action: AuthSessionAction): AuthSessionState {
    if (action.type === "clear") return initialAuthSessionState;

    const billingPolicy = parseBillingPolicy(action.session.billing_policy);
    if (action.session.type === "user" && action.session.user) {
        return {
            user: action.session.user,
            guest: null,
            subscription: action.session.subscription ?? null,
            billingPolicy,
        };
    }

    return {
        user: null,
        guest: action.session.guest ?? { id: "guest", trust: 1 },
        subscription: null,
        billingPolicy,
    };
}
