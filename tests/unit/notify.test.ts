/**
 * Unit tests for lib/notify.ts
 *
 * Run: npx tsx tests/unit/notify.test.ts
 */

import assert from "assert";

type ToastPayloadLike = {
    id: string;
    type: string;
    message: string;
    title?: string;
    description?: string;
    duration?: number;
    action?: { label: string; onClick: () => void };
};

type WindowStub = {
    __GLOBAL_NOTIFY__?: (toast: ToastPayloadLike) => void;
    __PLATEN_SESSION__?: Record<string, unknown>;
    __PLATEN_OPEN_AUTH_MODAL__?: (mode?: "login" | "register") => void;
    location: { href: string };
};

let toasts: ToastPayloadLike[] = [];
let authModalCalls: Array<string | undefined> = [];

function installWindow(session?: Record<string, unknown>, withSink = true): WindowStub {
    const stub: WindowStub = {
        __PLATEN_SESSION__: session,
        __PLATEN_OPEN_AUTH_MODAL__: (mode) => authModalCalls.push(mode),
        location: { href: "" },
    };
    if (withSink) stub.__GLOBAL_NOTIFY__ = (toast) => toasts.push(toast);

    (globalThis as unknown as { window: WindowStub }).window = stub;
    return stub;
}

installWindow();

import { notify, notifyBackendError, BackendError } from "../../lib/notify";

function reset() {
    toasts = [];
    authModalCalls = [];
}

function backendError(overrides: Partial<BackendError> = {}): BackendError {
    return { code: "GENERIC", message: "Request failed.", ...overrides };
}

const tests: Array<[string, () => void]> = [
    ["notify forwards message and defaults to the success type", () => {
        reset();
        installWindow();

        notify("Saved");

        assert.equal(toasts.length, 1);
        assert.equal(toasts[0].message, "Saved");
        assert.equal(toasts[0].type, "success");
        assert.ok(toasts[0].id, "a toast id is generated");
    }],

    ["notify passes through type and extra options", () => {
        reset();
        installWindow();

        notify("Nope", "error", { title: "Failed", duration: 1234 });

        assert.equal(toasts[0].type, "error");
        assert.equal(toasts[0].title, "Failed");
        assert.equal(toasts[0].duration, 1234);
    }],

    ["notify generates a unique id per toast", () => {
        reset();
        installWindow();

        notify("a");
        notify("b");

        assert.notEqual(toasts[0].id, toasts[1].id);
    }],

    ["notify is a no-op when no toast sink is registered", () => {
        reset();
        installWindow(undefined, false);

        notify("dropped");

        assert.equal(toasts.length, 0);
    }],

    ["notifyBackendError falls back to a generic error toast for a missing error", () => {
        reset();
        installWindow();

        notifyBackendError(null);

        assert.equal(toasts.length, 1);
        assert.equal(toasts[0].message, "Something went wrong.");
        assert.equal(toasts[0].type, "error");
        assert.equal(toasts[0].action, undefined);
    }],

    ["notifyBackendError derives a title from known usage-limit codes", () => {
        const cases: Array<[string, string]> = [
            ["DAILY_LIMIT_REACHED", "Daily limit reached"],
            ["HOURLY_LIMIT_REACHED", "Usage limit reached"],
            ["MONTHLY_LIMIT_REACHED", "Monthly allowance reached"],
            ["CREDITS_EXHAUSTED", "No credits remaining"],
            ["SUBSCRIPTION_REQUIRED", "Subscription required"],
            ["SOMETHING_ELSE", "Request failed"],
        ];

        for (const [code, title] of cases) {
            reset();
            installWindow({ tier: "free" });
            notifyBackendError(backendError({ code }));
            assert.equal(toasts[0].title, title, `title for ${code}`);
        }
    }],

    ["notifyBackendError prefers explicit title and description", () => {
        reset();
        installWindow({ tier: "free" });

        notifyBackendError(backendError({
            code: "DAILY_LIMIT_REACHED",
            title: "Custom title",
            description: "Custom description",
        }));

        assert.equal(toasts[0].title, "Custom title");
        assert.equal(toasts[0].description, "Custom description");
    }],

    ["notifyBackendError describes guests with a registration hint", () => {
        reset();
        installWindow({ tier: "guest", isGuest: true });

        notifyBackendError(backendError({ code: "DAILY_LIMIT_REACHED" }));

        assert.equal(toasts[0].description, "Create a free account to continue with higher usage.");
        assert.equal(toasts[0].action?.label, "Create free account");
    }],

    ["notifyBackendError tells pro users they are on the highest plan", () => {
        reset();
        installWindow({ tier: "pro" });

        notifyBackendError(backendError({ code: "MONTHLY_LIMIT_REACHED" }));

        assert.equal(
            toasts[0].description,
            "You are already on the highest plan. Contact support or wait for the limit reset."
        );
        assert.equal(toasts[0].action?.label, "Contact support");
    }],

    ["notifyBackendError offers an upgrade to free and plus tiers", () => {
        for (const tier of ["free", "plus"]) {
            reset();
            installWindow({ tier });

            notifyBackendError(backendError({ code: "CREDITS_EXHAUSTED" }));

            assert.equal(toasts[0].description, "Upgrade your plan to continue.", `description for ${tier}`);
            assert.equal(toasts[0].action?.label, "Upgrade plan", `action for ${tier}`);
        }
    }],

    ["notifyBackendError omits an action for unrelated errors", () => {
        reset();
        installWindow({ tier: "free" });

        notifyBackendError(backendError({ code: "COMPRESSION_ENGINE_FAILED" }));

        assert.equal(toasts[0].action, undefined);
    }],

    ["notifyBackendError adds an action when only upgradeRecommended is set", () => {
        reset();
        installWindow({ tier: "free" });

        notifyBackendError(backendError({ code: "COMPRESSION_ENGINE_FAILED", upgradeRecommended: true }));

        assert.equal(toasts[0].action?.label, "Upgrade plan");
    }],

    ["notifyBackendError honours suggestedAction over the session tier", () => {
        const cases: Array<[BackendError["suggestedAction"], string | undefined]> = [
            ["register", "Create free account"],
            ["upgrade", "Upgrade plan"],
            ["manage", "Manage plan"],
            ["contact", "Contact support"],
            ["wait", undefined],
        ];

        for (const [suggestedAction, label] of cases) {
            reset();
            installWindow({ tier: "pro" });

            notifyBackendError(backendError({ code: "DAILY_LIMIT_REACHED", suggestedAction }));

            assert.equal(toasts[0].action?.label, label, `action for ${suggestedAction}`);
        }
    }],

    ["the register action opens the auth modal in register mode", () => {
        reset();
        installWindow({ tier: "guest", isGuest: true });

        notifyBackendError(backendError({ code: "DAILY_LIMIT_REACHED" }));
        toasts[0].action?.onClick();

        assert.deepEqual(authModalCalls, ["register"]);
    }],

    ["plan actions navigate to the matching route", () => {
        const cases: Array<[BackendError["suggestedAction"], string]> = [
            ["upgrade", "/subscribe"],
            ["manage", "/account/subscription"],
            ["contact", "/contact"],
        ];

        for (const [suggestedAction, href] of cases) {
            reset();
            const stub = installWindow({ tier: "free" });

            notifyBackendError(backendError({ code: "DAILY_LIMIT_REACHED", suggestedAction }));
            toasts[0].action?.onClick();

            assert.equal(stub.location.href, href, `navigation for ${suggestedAction}`);
        }
    }],

    ["notifyBackendError uses the backend message and a 7s duration", () => {
        reset();
        installWindow({ tier: "free" });

        notifyBackendError(backendError({ code: "DAILY_LIMIT_REACHED", message: "Too many requests" }));

        assert.equal(toasts[0].message, "Too many requests");
        assert.equal(toasts[0].duration, 7000);
    }],

    ["notifyBackendError falls back to a default message when none is given", () => {
        reset();
        installWindow({ tier: "free" });

        notifyBackendError(backendError({ code: "DAILY_LIMIT_REACHED", message: "" }));

        assert.equal(toasts[0].message, "Request failed.");
    }],
];

function runTests(): void {
    console.log("Running notify tests...");
    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            fn();
            passed += 1;
            console.log(`  PASS  ${name}`);
        } catch (e) {
            failed += 1;
            console.error(`  FAIL  ${name}`);
            console.error(`        ${(e as Error).message}`);
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
