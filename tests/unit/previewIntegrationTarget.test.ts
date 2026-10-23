import assert from "node:assert/strict";
import { requireExplicitLoopbackOrigin, requireRevision } from "../security/milestone-1/previewIntegrationTarget";

assert.equal(requireExplicitLoopbackOrigin("http://127.0.0.1:8080", "backend"), "http://127.0.0.1:8080");
assert.equal(requireRevision("296838852195f96ca5590b3466a33ec5ae3e39d9", "backend revision"), "296838852195f96ca5590b3466a33ec5ae3e39d9");

for (const unsafe of [
    undefined,
    "",
    "http://localhost:8080",
    "http://api.platenpdf.com",
    "https://127.0.0.1:8080",
    "http://127.0.0.1",
    "http://user:password@127.0.0.1:8080",
    "http://127.0.0.1:8080/api",
    "http://127.0.0.1:8080?target=main",
]) {
    assert.throws(() => requireExplicitLoopbackOrigin(unsafe, "backend"));
}

assert.throws(() => requireRevision("master", "backend revision"));

console.log("PASS: preview integration targets require explicit loopback origins and pinned Git revisions");
