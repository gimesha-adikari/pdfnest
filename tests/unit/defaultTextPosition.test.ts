import assert from "node:assert/strict";
import { getDefaultTextPosition } from "../../lib/pdf/defaultTextPosition";

async function main() {
    const standard = getDefaultTextPosition(612, 792, 24);
    assert.deepEqual({ x: standard.x, y: standard.y, fontSize: standard.fontSize }, { x: 36, y: 720, fontSize: 24 });
    assert.ok(standard.x + standard.width <= 612);
    assert.ok(standard.y + standard.height <= 792);
    const compact = getDefaultTextPosition(80, 60, 24);
    assert.ok(compact.x >= 0 && compact.y >= 0);
    assert.ok(compact.x + compact.width <= 80);
    assert.ok(compact.y + compact.height <= 60);
    console.log("Add Text defaults to a bounded lower-page placement.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
