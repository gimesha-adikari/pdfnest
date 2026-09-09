import assert from "node:assert/strict";
import {
  fetchTileBlobUrl,
  globalTileCache,
} from "../../lib/studio-v2/tileClient";

const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let objectNumber = 0;
URL.createObjectURL = (() => `blob:studio-test-${++objectNumber}`) as typeof URL.createObjectURL;
URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

function response(status = 200, retryAfter?: string): Response {
  return new Response(new Blob(["tile"]), {
    status,
    statusText: status === 200 ? "OK" : "Too Many Requests",
    headers: retryAfter === undefined ? undefined : { "Retry-After": retryAfter },
  });
}

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function testDistinctPagesAreBounded(): Promise<void> {
  globalTileCache.clear();
  let active = 0;
  let maximumActive = 0;
  const releases: Array<() => void> = [];
  globalThis.fetch = (async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
    return response();
  }) as typeof fetch;

  const requests = Array.from({ length: 12 }, (_, index) =>
    fetchTileBlobUrl("session", "version", `page-${index}`, { scale: 1.35 }),
  );
  await nextTick();
  assert.equal(active, 2, "only the bounded first pair may reach the render endpoint");
  while (releases.length > 0) {
    releases.shift()?.();
    await nextTick();
  }
  await Promise.all(requests);
  assert.equal(maximumActive, 2, "distinct pages must not create an uncontrolled render fanout");
}

async function testIdenticalTilesAreCoalesced(): Promise<void> {
  globalTileCache.clear();
  let calls = 0;
  let release!: () => void;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise<void>((resolve) => { release = resolve; });
    return response();
  }) as typeof fetch;

  const first = fetchTileBlobUrl("session", "version", "same-page", { scale: 1.35 });
  const second = fetchTileBlobUrl("session", "version", "same-page", { scale: 1.35 });
  await nextTick();
  assert.equal(calls, 1, "the same version/page/scale tile must share one request");
  release();
  assert.equal(await first, await second);
}

async function testBusyRetryIsBounded(): Promise<void> {
  globalTileCache.clear();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1 ? response(429, "0") : response();
  }) as typeof fetch;
  await fetchTileBlobUrl("session", "version", "busy-page", { scale: 1.35 });
  assert.equal(calls, 2, "a capacity 429 may retry exactly once");
}

async function main(): Promise<void> {
  try {
    await testDistinctPagesAreBounded();
    await testIdenticalTilesAreCoalesced();
    await testBusyRetryIsBounded();
    console.log("studioTileClient.test.ts passed");
  } finally {
    globalTileCache.clear();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

void main();
