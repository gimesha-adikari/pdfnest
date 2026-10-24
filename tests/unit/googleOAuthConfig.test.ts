import assert from "node:assert/strict";
import { isGoogleOAuthConfigured } from "@/lib/googleOAuth";
for (const nodeEnv of ["development", "production", "test"]) {
        for (const [id, expected] of [[undefined, false], ["", false], ["   ", false], ["configured-client-id", true]] as const) {
            assert.equal(isGoogleOAuthConfigured(id), expected, `${nodeEnv}: configured OAuth availability`);
        }
    }
console.log("PASS: configured Google OAuth is available in development and production; empty IDs disable it");
