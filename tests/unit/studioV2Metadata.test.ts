import { studioMetadataDefaults } from "@/components/studio-v2/metadata";
import assert from "node:assert/strict";

assert.deepEqual(studioMetadataDefaults({
    Title: "Source title",
    Author: "Source author",
    Subject: "Source subject",
    Keywords: "one, two",
    Creator: "not exposed",
  }), {
    title: "Source title",
    author: "Source author",
    subject: "Source subject",
    keywords: "one, two",
});

assert.deepEqual(studioMetadataDefaults({ title: "", author: "A", subject: "", keywords: "K" }), {
    title: "",
    author: "A",
    subject: "",
    keywords: "K",
});

console.log("Studio V2 metadata mapping tests passed.");
