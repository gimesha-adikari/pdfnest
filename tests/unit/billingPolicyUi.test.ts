import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import PlanButtons from "../../components/subscription/PlanButtons";
import {canStartPurchase, paddleTransactionPolicyDecision} from "../../lib/billingPolicyUi";
import {openPaddleTransactionOverlay} from "../../lib/paddle";

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

function renderPlanButtons(billingPolicy: typeof normalPolicy | typeof freePolicy | null, currentTier = "free") {
    return renderToStaticMarkup(createElement(PlanButtons, {
        tier: "plus",
        monthlyPrice: "4.99",
        yearlyPrice: "49.99",
        currentTier,
        isProcessing: false,
        onUpgrade: () => undefined,
        trialText: "Trial",
        billingPolicy,
    } as never));
}

const normalMarkup = renderPlanButtons(normalPolicy);
assert.equal((normalMarkup.match(/disabled=""/g) ?? []).length, 0, "normal mode keeps purchase buttons actionable");
assert.match(normalMarkup, /7-day free trial/i, "normal mode keeps the existing trial terms");

const freeMarkup = renderPlanButtons(freePolicy, "pro");
assert.equal((freeMarkup.match(/disabled=""/g) ?? []).length, 2, "free mode disables both new purchase buttons for paid members too");
assert.match(freeMarkup, /temporarily unavailable/i, "free mode explains why new subscription purchases are unavailable");
assert.doesNotMatch(freeMarkup, /free trial|auto-renew/i, "free mode does not promise unavailable purchase terms");

const unknownMarkup = renderPlanButtons(null);
assert.equal((unknownMarkup.match(/disabled=""/g) ?? []).length, 2, "unknown policy fails closed for purchase actions");
assert.match(unknownMarkup, /availability/i, "unknown policy explains that purchase availability is not yet known");
assert.doesNotMatch(unknownMarkup, /free trial|auto-renew/i, "unknown policy does not present checkout terms as actionable");

assert.equal(canStartPurchase(normalPolicy), true, "normal policy permits purchase initiation");
assert.equal(canStartPurchase(freePolicy), false, "free policy disables purchase initiation");
assert.equal(canStartPurchase(null), false, "unknown policy fails closed");
assert.equal(paddleTransactionPolicyDecision(normalPolicy), "open", "normal _ptxn flow remains available");
assert.equal(paddleTransactionPolicyDecision(freePolicy), "discard", "free _ptxn flow does not open checkout");
assert.equal(paddleTransactionPolicyDecision(null), "wait", "unknown _ptxn flow waits for policy resolution");

console.log("✓ plan purchase controls follow normal, free, and unknown billing policy");

void (async () => {
    await assert.rejects(
        openPaddleTransactionOverlay("https://checkout.example.test/?_ptxn=txn_existing", freePolicy),
        /New purchases are unavailable/
    );
    await assert.rejects(
        openPaddleTransactionOverlay("https://checkout.example.test/?_ptxn=txn_existing", null),
        /New purchases are unavailable/
    );
    console.log("✓ Paddle overlay refuses free and unknown policy before initialization");
})();
