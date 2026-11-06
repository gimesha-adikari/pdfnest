import assert from "assert";

import { findTextItemMatches, findWordMatches } from "@/lib/markupFind";

function runTests(): void {
    const words = [
        { text: "Alpha" },
        { text: "Bravo" },
        { text: "alpha" },
        { text: "Charlie" },
    ];
    const repeated = findWordMatches(words, "alpha");
    assert.deepStrictEqual(repeated.map((match) => [match.text, match.startIndex, match.endIndex]), [
        ["Alpha", 0, 0],
        ["alpha", 2, 2],
    ]);
    assert.deepStrictEqual(findWordMatches(words, "Bravo alpha"), [{ text: "Bravo alpha", startIndex: 1, endIndex: 2 }]);
    assert.deepStrictEqual(findWordMatches(words, "missing"), []);
    assert.deepStrictEqual(findTextItemMatches([{ str: "Find" }, { str: " this" }, { str: " page" }], "this page"), [{ text: "this page", startIndex: 1, endIndex: 2 }]);
    assert.deepStrictEqual(
        findTextItemMatches([{ str: "PLATEN SYNTHETIC" }, { str: " " }, { str: "E2E PAGE 1" }], "PLATEN SYNTHETIC E2E PAGE 1"),
        [{ text: "PLATEN SYNTHETIC E2E PAGE 1", startIndex: 0, endIndex: 2 }],
    );
}

runTests();
console.log("Markup Find matching tests passed.");
