/** CONTENT hardening regression for the Admin About update request contract. */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function main() {
    const root = process.cwd();
    const pageSource = fs.readFileSync(
        path.resolve(root, "app/(site)/admin/content/page.tsx"),
        "utf8"
    );

    assert.match(
        pageSource,
        /serializeAboutContentPayload\(aboutData\)/,
        "About saves must pass through the explicit backend-key serializer"
    );
    assert.doesNotMatch(
        pageSource,
        /body: JSON\.stringify\(aboutData\)/,
        "About saves must not send the public PascalCase object directly"
    );

    const { serializeAboutContentPayload } = await import(
        "../../lib/adminAboutContentPayload"
    );
    const payload = serializeAboutContentPayload({
        HeroTag: "About",
        HeroTitle: "Title",
        HeroDescription: "Description",
        StatsJson: "[]",
        SectionTitle: "Section",
        SectionSubtitle: "Subtitle",
        HighlightsJson: "[{\"title\":\"PDF Tools\"}]",
        StudioTitle: "Studio",
        StudioDescription: "Studio description",
        StudioFeaturesJson: "[]",
        CanvasTitle: "Canvas",
        CanvasDescription: "Canvas description",
        CanvasFeaturesJson: "[]",
        SecurityTitle: "Security",
        SecurityDescription: "Security description",
        RoadmapTitle: "Roadmap",
        RoadmapDescription: "Roadmap description",
        RoadmapJson: "[]",
        MissionTitle: "Mission",
        MissionDescription: "Mission description",
    });

    assert.equal(payload.highlightsJson, "[{\"title\":\"PDF Tools\"}]");
    assert.equal("HighlightsJson" in payload, false);
    assert.equal(payload.heroTitle, "Title");
    assert.equal(payload.missionDescription, "Mission description");

    console.log("Admin About highlights request-key contract passed.");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
