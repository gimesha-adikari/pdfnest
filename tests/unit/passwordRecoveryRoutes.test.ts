import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
    fs.readFileSync(path.join(root, relativePath), "utf8");

const login = read("app/(site)/login/page.tsx");
const forgot = read("app/(site)/forgot-password/page.tsx");
const forgotLayout = read("app/(site)/forgot-password/layout.tsx");
const reset = read("app/(site)/reset-password/page.tsx");
const resetLayout = read("app/(site)/reset-password/layout.tsx");
const seoRoutes = read("lib/seoRoutes.ts");

assert.match(login, /href="\/forgot-password"/);
assert.match(forgot, /fetchJson<\{ message\?: string \}>\("\/auth\/request-password-reset"/);
assert.match(reset, /fetchJson<\{ message\?: string \}>\("\/auth\/reset-password"/);
assert.match(reset, /token, password/);
assert.match(forgotLayout, /buildNoIndexMetadata/);
assert.match(resetLayout, /buildNoIndexMetadata/);
assert.match(seoRoutes, /"\/forgot-password"/);
assert.match(seoRoutes, /"\/reset-password"/);

console.log("Password recovery UI routes, backend contracts, and noindex boundaries are wired.");
