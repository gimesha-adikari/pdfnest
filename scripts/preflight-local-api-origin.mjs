import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

function fail(message) {
    console.error(`Frontend API-origin preflight failed: ${message}`);
    process.exit(1);
}

function parseArgs(argv) {
    let mode;
    let distDir = ".next";
    let requireLocal = false;

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--dev" || argument === "--start") {
            if (mode) fail("choose exactly one runtime mode");
            mode = argument.slice(2);
        } else if (argument === "--local") {
            requireLocal = true;
        } else if (argument === "--dist-dir") {
            const value = argv[index + 1];
            if (!value || value.startsWith("--")) fail("--dist-dir requires a path");
            distDir = value;
            index += 1;
        } else {
            fail("unsupported argument");
        }
    }

    if (!mode) fail("a runtime mode is required");
    return { mode, distDir, requireLocal };
}

function configuredApiOrigin() {
    const value = (process.env.NEXT_PUBLIC_API_URL || "").trim();
    if (!value) fail("NEXT_PUBLIC_API_URL must be set explicitly");

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        fail("NEXT_PUBLIC_API_URL must be an absolute HTTP(S) origin");
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== "/" || parsed.search || parsed.hash) {
        fail("NEXT_PUBLIC_API_URL must contain only an HTTP(S) origin");
    }

    return parsed;
}

function isLoopback(parsed) {
    const hostname = parsed.hostname.toLowerCase();
    const address = hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
    if (address === "localhost" || address === "::1") return true;
    if (net.isIP(address) === 4) return Number(address.split(".")[0]) === 127;
    return false;
}

async function collectJavaScriptFiles(directory) {
    const files = [];
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        fail("the compiled client output is missing or unreadable");
    }

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectJavaScriptFiles(fullPath));
        } else if (entry.isFile() && /\.(?:m?js|cjs)$/i.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

function normalizedSource(value) {
    return value.replaceAll("\\/", "/").toLowerCase();
}

async function verifyCompiledClient(apiUrl, distDir, requireLocal) {
    if (requireLocal && (apiUrl.protocol !== "http:" || !isLoopback(apiUrl))) {
        fail("local start requires an explicit loopback local API origin");
    }

    const staticRoot = path.resolve(distDir, "static");
    const files = await collectJavaScriptFiles(staticRoot);
    if (files.length === 0) fail("no compiled browser JavaScript was found");

    let configuredOriginFound = false;
    let localBuild = isLoopback(apiUrl);
    const productionApiPattern = /https?:\/\/api\.platenpdf\.com(?::\d+)?(?:[/?#]|["'`\\]|$)/i;
    const r2Pattern = /https?:\/\/[^\s"'`<>\\]*\.r2\.(?:cloudflarestorage\.com|dev)(?::\d+)?(?:[/?#]|["'`\\]|$)/i;
    const configuredOrigin = normalizedSource(apiUrl.origin);
    const escapedOrigin = configuredOrigin.replaceAll("/", "\\/");

    for (const file of files) {
        let source;
        try {
            source = normalizedSource(await readFile(file, "utf8"));
        } catch {
            fail("a compiled browser chunk could not be read");
        }

        if (source.includes(configuredOrigin) || source.includes(escapedOrigin)) {
            configuredOriginFound = true;
        }
        if (localBuild && productionApiPattern.test(source)) {
            fail("a local browser bundle contains the production API origin");
        }
        if (localBuild && r2Pattern.test(source)) {
            fail("a local browser bundle contains a direct R2 storage origin");
        }
    }

    if (!configuredOriginFound) {
        fail("the compiled browser API origin does not match NEXT_PUBLIC_API_URL");
    }
}

const { mode, distDir, requireLocal } = parseArgs(process.argv.slice(2));
loadEnvConfig(process.cwd(), mode === "dev");
const apiUrl = configuredApiOrigin();

if (mode === "dev") {
    if (apiUrl.protocol !== "http:" || !isLoopback(apiUrl)) {
        fail("development mode requires an explicit loopback local API origin");
    }
    console.log("Frontend development API-origin preflight passed.");
} else {
    await verifyCompiledClient(apiUrl, distDir, requireLocal);
    console.log("Frontend compiled API-origin preflight passed.");
}
