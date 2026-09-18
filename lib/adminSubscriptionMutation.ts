export interface AdminSubscriptionMutationPayload {
    userId: string;
    tier: string;
    status: string;
    customCredits: number;
    daysToPlus: number;
}

export interface AdminSubscriptionOperation {
    key: string;
    userId: string;
    fingerprint: string;
}

export interface AdminSubscriptionSaveState {
    inFlight: boolean;
    operation: AdminSubscriptionOperation | null;
}

function fingerprintFor(payload: AdminSubscriptionMutationPayload): string {
    return JSON.stringify({
        user_id: payload.userId,
        tier: payload.tier,
        status: payload.status,
        custom_credits: payload.customCredits,
        days_to_plus: payload.daysToPlus,
    });
}

export function createAdminSubscriptionOperationKey(): string {
    const suffix =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `admin-subscription-${suffix}`;
}

export function getOrCreateAdminSubscriptionOperation(
    previous: AdminSubscriptionOperation | null,
    payload: AdminSubscriptionMutationPayload,
): AdminSubscriptionOperation {
    const fingerprint = fingerprintFor(payload);
    if (previous && previous.userId === payload.userId && previous.fingerprint === fingerprint) {
        return previous;
    }
    return {
        key: createAdminSubscriptionOperationKey(),
        userId: payload.userId,
        fingerprint,
    };
}

export function createAdminSubscriptionSaveState(): AdminSubscriptionSaveState {
    return {inFlight: false, operation: null};
}

export function beginAdminSubscriptionSave(
    state: AdminSubscriptionSaveState,
    payload: AdminSubscriptionMutationPayload,
): AdminSubscriptionOperation | null {
    if (state.inFlight) return null;
    state.inFlight = true;
    state.operation = getOrCreateAdminSubscriptionOperation(state.operation, payload);
    return state.operation;
}

export function finishAdminSubscriptionSave(state: AdminSubscriptionSaveState, succeeded: boolean): void {
    state.inFlight = false;
    if (succeeded) state.operation = null;
}
