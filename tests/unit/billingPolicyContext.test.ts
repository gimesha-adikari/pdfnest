import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const authContextPath = path.resolve(__dirname, "../../context/AuthContext.tsx");
const authContextSource = fs.readFileSync(authContextPath, "utf8");

assert.ok(authContextSource.includes("authSessionReducer"), "AuthContext must apply policy through the tested session-state reducer");
assert.ok(authContextSource.includes("billingPolicy"), "AuthContext must expose effective policy separately from subscription");

async function runTests() {
    const { authSessionReducer, initialAuthSessionState } = await import("../../context/authSessionState");
    const normalPolicy = {
        mode: "normal" as const,
        processing_unit_limits_enforced: true,
        purchases_enabled: true,
    };
    const freePolicy = {
        mode: "free" as const,
        processing_unit_limits_enforced: false,
        purchases_enabled: false,
    };

    const normalGuest = authSessionReducer(initialAuthSessionState, {
        type: "apply",
        session: { authenticated: true, type: "guest", guest: { id: "guest-1", trust: 1 }, billing_policy: normalPolicy },
    });
    assert.equal(normalGuest.guest?.id, "guest-1");
    assert.deepEqual(normalGuest.billingPolicy, normalPolicy);

    const freeGuest = authSessionReducer(initialAuthSessionState, {
        type: "apply",
        session: { authenticated: true, type: "guest", guest: { id: "guest-2", trust: 1 }, billing_policy: freePolicy },
    });
    assert.equal(freeGuest.billingPolicy?.mode, "free");
    assert.equal(freeGuest.billingPolicy?.processing_unit_limits_enforced, false);
    assert.equal(freeGuest.billingPolicy?.purchases_enabled, false);

    const proInFree = authSessionReducer(initialAuthSessionState, {
        type: "apply",
        session: {
            authenticated: true,
            type: "user",
            user: { id: "user-1", email: "pro@example.test", role: "user" },
            subscription: {
                role: "user", tier: "pro", status: "active", billing_interval: "yearly",
                current_period_end: "2030-01-01T00:00:00Z", custom_credits: 120,
                used_units_3h: 3, used_units_daily: 5, used_units_monthly: 8,
            },
            billing_policy: freePolicy,
        },
    });
    assert.equal(proInFree.subscription?.tier, "pro");
    assert.equal(proInFree.subscription?.custom_credits, 120);
    assert.equal(proInFree.billingPolicy?.mode, "free");

    const proInNormal = authSessionReducer(initialAuthSessionState, {
        type: "apply",
        session: {
            authenticated: true,
            type: "user",
            user: { id: "user-1", email: "pro@example.test", role: "user" },
            subscription: proInFree.subscription,
            billing_policy: normalPolicy,
        },
    });
    assert.equal(proInNormal.billingPolicy?.mode, "normal");
    const switchedToFree = authSessionReducer(proInNormal, {
        type: "apply",
        session: {
            authenticated: true,
            type: "user",
            user: { id: "user-1", email: "pro@example.test", role: "user" },
            subscription: proInFree.subscription,
            billing_policy: freePolicy,
        },
    });
    assert.equal(switchedToFree.billingPolicy?.mode, "free");
    assert.equal(switchedToFree.subscription?.tier, "pro");

    const unavailable = authSessionReducer(switchedToFree, { type: "clear" });
    assert.equal(unavailable.billingPolicy, null);
    assert.equal(unavailable.subscription, null);
    assert.equal(unavailable.user, null);

    const logoutToGuest = authSessionReducer(unavailable, {
        type: "apply",
        session: { authenticated: true, type: "guest", guest: { id: "guest-after-logout", trust: 1 }, billing_policy: freePolicy },
    });
    assert.equal(logoutToGuest.guest?.id, "guest-after-logout");
    assert.equal(logoutToGuest.billingPolicy?.mode, "free");

    const missingPolicy = authSessionReducer(logoutToGuest, {
        type: "apply",
        session: { authenticated: true, type: "guest", guest: { id: "old-replica", trust: 1 } },
    });
    assert.equal(missingPolicy.billingPolicy, null, "missing policy must remain unknown rather than default to normal");

    console.log("✓ effective billing policy stays separate through guest, user, refresh, failure, and logout session transitions");
}

void runTests();
