import assert from "node:assert/strict";
import { buildNoIndexMetadata } from "../../lib/seoMetadata";
import { PRODUCTION_SITE_URL } from "../../lib/siteUrl";
import { metadata as loginMetadata } from "../../app/(site)/login/layout";
import { metadata as registerMetadata } from "../../app/(site)/register/layout";
import { metadata as verifyEmailMetadata } from "../../app/(site)/verify-email/layout";

assert.deepEqual(loginMetadata.robots, { index: false, follow: true });
assert.equal(loginMetadata.alternates?.canonical, "/login");
assert.equal(
    new URL(String(loginMetadata.alternates?.canonical), PRODUCTION_SITE_URL).toString(),
    "https://platenpdf.com/login"
);

assert.deepEqual(registerMetadata.robots, { index: false, follow: true });
assert.equal(registerMetadata.alternates?.canonical, "/register");
assert.notEqual(registerMetadata.alternates?.canonical, "/login");

assert.deepEqual(verifyEmailMetadata.robots, { index: false, follow: true });
assert.equal(verifyEmailMetadata.alternates, undefined);
assert.equal(JSON.stringify(verifyEmailMetadata).includes("token"), false);

const privateMetadata = buildNoIndexMetadata();
assert.deepEqual(privateMetadata.robots, { index: false, follow: true });
assert.equal(privateMetadata.alternates, undefined);

const workspaceMetadata = buildNoIndexMetadata({ canonical: null });
assert.equal(workspaceMetadata.alternates?.canonical, null);

console.log("SEO metadata policy tests passed.");
