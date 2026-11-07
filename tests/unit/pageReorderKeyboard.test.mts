import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { arrayMove } from "@dnd-kit/sortable";

async function main() {
    const source = await readFile(
        new URL("../../components/pdf/PageReorderGrid.tsx", import.meta.url),
        "utf8",
    );

    assert.match(source, /KeyboardSensor/);
    assert.match(source, /coordinateGetter:\s*sortableKeyboardCoordinates/);
    assert.match(source, /screenReaderInstructions/);
    assert.match(source, /onDragStart:/);
    assert.match(source, /onDragEnd:/);

    assert.deepEqual(arrayMove([1, 2, 3], 2, 0), [3, 1, 2]);
    assert.deepEqual(arrayMove([1, 2, 3], 1, 0), [2, 1, 3]);

    console.log("Reorder Pages keeps keyboard sorting and both required page orders.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
