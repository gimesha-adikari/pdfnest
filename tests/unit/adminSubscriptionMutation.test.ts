import assert from "node:assert/strict";
import {
    beginAdminSubscriptionSave,
    createAdminSubscriptionSaveState,
    finishAdminSubscriptionSave,
} from "@/lib/adminSubscriptionMutation";

const payload = {
    userId: "synthetic-admin001-user",
    tier: "free",
    status: "active",
    customCredits: 50,
    daysToPlus: 0,
};

const state = createAdminSubscriptionSaveState();
const first = beginAdminSubscriptionSave(state, payload);
assert.ok(first, "first logical save starts");
const duplicateWhilePending = beginAdminSubscriptionSave(state, payload);
assert.equal(duplicateWhilePending, null, "same-tick duplicate save is synchronously suppressed");
finishAdminSubscriptionSave(state, false);

const retry = beginAdminSubscriptionSave(state, payload);
assert.ok(retry, "failed save can be retried");
assert.equal(retry?.key, first?.key, "same logical payload reuses the operation key for retry");
assert.equal(retry?.fingerprint, first?.fingerprint, "same logical payload keeps the same fingerprint");
finishAdminSubscriptionSave(state, true);

const separateGrant = beginAdminSubscriptionSave(state, {...payload, customCredits: 25});
assert.ok(separateGrant, "successful save allows a later intentional grant");
assert.notEqual(separateGrant?.key, first?.key, "a changed grant amount is a distinct logical operation");
finishAdminSubscriptionSave(state, true);

const otherTarget = beginAdminSubscriptionSave(state, {...payload, userId: "synthetic-admin001-other"});
assert.ok(otherTarget, "a different target can start a distinct operation");
assert.notEqual(otherTarget?.key, first?.key, "a different target is a distinct logical operation");
finishAdminSubscriptionSave(state, true);
console.log("ADMIN-001 frontend operation tests passed: same-tick suppression, retry reuse, changed-grant separation, and target separation.");
