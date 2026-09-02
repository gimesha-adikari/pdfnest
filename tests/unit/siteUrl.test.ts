import assert from "node:assert/strict";
import {
    getSiteUrl,
    normalizeSiteUrl,
    PRODUCTION_SITE_URL,
} from "../../lib/siteUrl";

assert.equal(PRODUCTION_SITE_URL, "https://platenpdf.com");
assert.equal(
    normalizeSiteUrl("https://www.platenpdf.com"),
    "https://platenpdf.com"
);
assert.equal(
    normalizeSiteUrl("https://www.platenpdf.com/tools/merge?source=nav"),
    "https://platenpdf.com/tools/merge?source=nav"
);
assert.equal(
    normalizeSiteUrl("http://localhost:3000/"),
    "http://localhost:3000"
);
assert.equal(
    normalizeSiteUrl("https://preview.example.com/"),
    "https://preview.example.com"
);

const originalAppEnv = process.env.APP_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
try {
    process.env.APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.example.com";
    assert.equal(getSiteUrl(), PRODUCTION_SITE_URL);
} finally {
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
}

console.log("Site URL normalization tests passed.");
