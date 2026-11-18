import { randomBytes } from "node:crypto";
import { readdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

const api = process.env.NEXT_PUBLIC_API_URL;
const outbox = process.env.MAILER_OUTBOX_DIR;
const evidence = path.join(process.env.RUNNER_TEMP || "/tmp", "studio-evidence");
const run = process.env.GITHUB_RUN_ID || randomBytes(8).toString("hex");
const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
const email = "studio-ci-" + run + "-" + attempt + "@example.test";
const password = randomBytes(32).toString("base64url");

function requireValue(v, label) { if (!v) throw new Error("Missing required test configuration: " + label); }
requireValue(api, "NEXT_PUBLIC_API_URL");
requireValue(outbox, "MAILER_OUTBOX_DIR");
requireValue(process.env.ADMIN_EMAIL, "ADMIN_EMAIL");
requireValue(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD");
requireValue(process.env.GITHUB_ENV, "GITHUB_ENV");

async function request(pathname, options = {}) {
  const response = await fetch(api + "/api" + pathname, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Test-only service request failed at " + pathname + " with HTTP " + response.status);
  return { response, body };
}

const created = await request("/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password, policy_accepted: true }),
});
if (created.response.status !== 201 || !created.body.userId) throw new Error("Test-only registration did not return a user identity.");

const mailFiles = (await readdir(outbox)).filter((name) => name.startsWith("mail-") && name.endsWith(".json"));
let token = "";
for (const name of mailFiles) {
  const item = JSON.parse(await readFile(path.join(outbox, name), "utf8"));
  if ((item.To || []).some((address) => address === email)) {
    const match = String(item.Text || "").match(/verify-email\?token=([a-f0-9]{64})/);
    if (match) token = match[1];
  }
}
if (!token) throw new Error("The isolated verification outbox did not contain the newly registered test identity.");

const verified = await request("/auth/verify-email", {
  method: "POST",
  body: JSON.stringify({ token }),
});
if (verified.body.success !== true) throw new Error("The isolated test identity was not verified through the application endpoint.");

const adminLogin = await fetch(api + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
if (!adminLogin.ok) throw new Error("Ephemeral database admin authentication failed with HTTP " + adminLogin.status);
const adminCookie = (adminLogin.headers.get("set-cookie") || "").match(/(?:^|,\s*)auth_token=([^;,]+)/)?.[1];
if (!adminCookie) throw new Error("Ephemeral database admin login did not issue its expected session cookie.");

const grant = await fetch(api + "/api/admin/users/" + encodeURIComponent(created.body.userId) + "/tier", {
  method: "PATCH",
  headers: {
    "content-type": "application/json",
    cookie: "auth_token=" + adminCookie,
    "Idempotency-Key": "studio-ci-" + run + "-" + attempt,
  },
  body: JSON.stringify({ tier: "plus", status: "active", custom_credits: 300, days_to_plus: 30 }),
});
if (!grant.ok) throw new Error("Ephemeral test-account allowance grant was rejected with HTTP " + grant.status);

const userLogin = await fetch(api + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!userLogin.ok) throw new Error("Test identity could not authenticate with HTTP " + userLogin.status);
const userCookie = (userLogin.headers.get("set-cookie") || "").match(/(?:^|,\s*)auth_token=([^;,]+)/)?.[1];
if (!userCookie) throw new Error("Test identity login did not issue its expected session cookie.");

const sessionResponse = await fetch(api + "/api/auth/session", { headers: { cookie: "auth_token=" + userCookie } });
const session = await sessionResponse.json().catch(() => ({}));
if (!sessionResponse.ok || !session.authenticated || session.type !== "user" ||
    session.subscription?.tier !== "plus" || session.subscription?.status !== "active" ||
    Number(session.subscription?.custom_credits) < 300) {
  throw new Error("The authenticated test identity's live allowance did not match the run-scoped grant.");
}
if (Number(session.subscription?.used_units_3h) >= 300) {
  throw new Error("The authenticated test identity has exhausted its isolated run-scoped allowance.");
}

const allowance = {
  setup: "run-scoped isolated PostgreSQL test identity",
  registration_http: created.response.status,
  email_verification: "application endpoint succeeded using isolated local mail outbox",
  admin_grant: grant.status,
  session_http: sessionResponse.status,
  authenticated: session.authenticated,
  identity_type: session.type,
  subscription_tier: session.subscription.tier,
  subscription_status: session.subscription.status,
  custom_credits: session.subscription.custom_credits,
  used_units_3h: session.subscription.used_units_3h,
  billing_policy_mode: session.billing_policy?.mode || "reported-by-session",
  no_production_credentials: true,
};
await writeFile(path.join(evidence, "account-allowance.json"), JSON.stringify(allowance, null, 2) + "\n");
for (const value of [email, password]) console.log("::add-mask::" + value);
await appendFile(process.env.GITHUB_ENV, "E2E_TEST_EMAIL=" + email + "\nE2E_TEST_PASSWORD=" + password + "\n");
