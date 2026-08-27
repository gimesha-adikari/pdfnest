import assert from "node:assert/strict";
import { StudioV2SubmissionGuard } from "../../components/studio-v2/studioV2SubmissionGuard";

async function main() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const guard = new StudioV2SubmissionGuard();
  let calls = 0;

  const first = guard.run("materialize:merge", async () => {
    calls += 1;
    await gate;
    return "done";
  });
  const second = guard.run("materialize:merge", async () => {
    calls += 1;
    return "duplicate";
  });

  assert.equal(calls, 1, "a synchronous second invocation must be rejected before the first await");
  assert.equal(guard.isActive("materialize:merge"), true);
  assert.equal(await second, undefined);
  release();
  assert.equal(await first, "done");
  assert.equal(guard.isActive("materialize:merge"), false);

  let rejectedCalls = 0;
  await assert.rejects(
    guard.run("job:markup-apply", async () => {
      rejectedCalls += 1;
      throw new Error("expected failure");
    }),
    /expected failure/,
  );
  assert.equal(rejectedCalls, 1);
  assert.equal(guard.isActive("job:markup-apply"), false, "failure must release the guard");
  assert.equal(await guard.run("job:markup-apply", async () => "retry"), "retry");

  assert.equal(await guard.run("command:rotate-page", async () => "rotate"), "rotate");
  assert.equal(await guard.run("command:delete-page", async () => "delete"), "delete");

  console.log("studioV2SubmissionGuard.test.ts passed");
}

void main();
