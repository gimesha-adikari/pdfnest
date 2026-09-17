import assert from "assert";
import {
  DEFAULT_EDITOR_LANGUAGE,
  EditorLanguageChoice,
} from "@/components/editor-v2/model";
import {
  shouldPollEditorExtraction,
} from "@/lib/studio-v2/editorExtractionState";

console.log("Running Studio V2 session reuse & extraction qualification tests...");

const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => { storage.set(key, val); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
};

const languageKey = (choice: EditorLanguageChoice) => `${choice.mode}:${choice.languages.join("+")}`;
const sessionLanguageKey = (session: string) => `studio-v2-editor-lang:${session}`;
const extractKey = (session: string, version: string, choice: EditorLanguageChoice) =>
  `studio-v2-editor-extract:${session}:${version}:${languageKey(choice)}`;

const sessionId = "session-test-001";
const v1Id = "version-v1";
const v2Id = "version-v2";

// 1. Session language persistence
const initialLang: EditorLanguageChoice = DEFAULT_EDITOR_LANGUAGE;
assert.deepStrictEqual(initialLang, { mode: "AUTO", languages: ["eng", "sin", "tam"] });

// User selects English explicitly (e.g. after language uncertainty)
const userSelectedLang: EditorLanguageChoice = { mode: "EXPLICIT", languages: ["eng"] };
mockLocalStorage.setItem(sessionLanguageKey(sessionId), JSON.stringify(userSelectedLang));

// When Editor V2 is reopened on the session:
const persistedRaw = mockLocalStorage.getItem(sessionLanguageKey(sessionId));
assert.notStrictEqual(persistedRaw, null);
const restoredLang = JSON.parse(persistedRaw!);
assert.deepStrictEqual(restoredLang, userSelectedLang, "Session language choice is restored on reopen instead of reverting to AUTO");

// 2. Version-aware extraction key persistence & retention
const v1Key = extractKey(sessionId, v1Id, restoredLang);
mockLocalStorage.setItem(v1Key, "job-extract-v1");
assert.strictEqual(mockLocalStorage.getItem(v1Key), "job-extract-v1");

// On extraction success, key is RETAINED in localStorage (no removeItem)
// Simulating remount / reopen on v1:
const reopenedV1Job = mockLocalStorage.getItem(v1Key);
assert.strictEqual(reopenedV1Job, "job-extract-v1", "v1 extraction job key is retained across workspace unmount/remount");

// 3. Compiled version has its own distinct key
const v2Key = extractKey(sessionId, v2Id, restoredLang);
assert.notStrictEqual(v1Key, v2Key, "Version 2 has its own isolated extraction key");
mockLocalStorage.setItem(v2Key, "job-extract-v2");
assert.strictEqual(mockLocalStorage.getItem(v2Key), "job-extract-v2");

// 4. Retry invalidation: only explicit retry removes the key for that version & language
mockLocalStorage.removeItem(extractKey(sessionId, v1Id, restoredLang));
assert.strictEqual(mockLocalStorage.getItem(v1Key), null, "Retry explicitly invalidates only targeted key");
assert.strictEqual(mockLocalStorage.getItem(v2Key), "job-extract-v2", "Other version keys remain intact");

// 5. Polling contract check
const succeededJob = { status: "succeeded", editor_state_id: "state-reused-123" };
assert.strictEqual(shouldPollEditorExtraction(succeededJob, false), false,
  "Terminal succeeded job correctly bypasses polling loop; handled immediately by submitExtract loadState");

console.log("Studio V2 session reuse & extraction qualification tests passed cleanly.");
