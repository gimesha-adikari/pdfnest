/**
 * BILL-002 deterministic display-price regression.
 *
 * This is a source-level contract test: it validates the six displayed pack
 * values and the unchanged checkout request construction without opening a
 * browser checkout or making a provider request.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dashboardSource = fs.readFileSync(
    path.resolve(process.cwd(), "app/(site)/dashboard/page.tsx"),
    "utf8"
);

const approvedPacks = [
    { credits: 10, price: 0.70 },
    { credits: 20, price: 1.40 },
    { credits: 50, price: 2.00 },
    { credits: 100, price: 4.00 },
    { credits: 200, price: 6.00 },
    { credits: 500, price: 10.00 },
];

const arrayMatch = dashboardSource.match(/const\s+creditPacks\s*=\s*\[([\s\S]*?)\];/);
assert.ok(arrayMatch, "dashboard must define the creditPacks display matrix");

const actualPacks = [...arrayMatch[1].matchAll(
    /\{\s*credits:\s*(\d+)\s*,\s*price:\s*(\d+(?:\.\d+)?)\s*\}/g
)].map((match) => ({
    credits: Number(match[1]),
    price: Number(match[2]),
}));

assert.deepEqual(actualPacks, approvedPacks, "credit-pack display matrix must match approved Paddle prices");
assert.equal(new Set(actualPacks.map((pack) => pack.credits)).size, 6, "credit quantities must be unique");
assert.match(
    dashboardSource,
    /\$\{pack\.price\.toFixed\(2\)\}\s+One-off/,
    "credit-pack display prices must retain two-decimal formatting"
);

// The display-only change must not alter the checkout quantity contract.
assert.match(
    dashboardSource,
    /fetchJson<\{\s*checkout_url:\s*string\s*\}>\("\/billing\/checkout-credits"/
);
assert.match(dashboardSource, /method:\s*["']POST["']/);
assert.match(dashboardSource, /body:\s*JSON\.stringify\(\{\s*credits:\s*amount\s*\}\)/);

console.log("BILL-002 credit-pack display matrix and checkout quantity contract passed.");
