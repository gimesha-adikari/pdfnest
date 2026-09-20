const ABOUT_CONTENT_FIELD_MAP = {
    HeroTag: "heroTag",
    HeroTitle: "heroTitle",
    HeroDescription: "heroDescription",
    StatsJson: "statsJson",
    SectionTitle: "sectionTitle",
    SectionSubtitle: "sectionSubtitle",
    HighlightsJson: "highlightsJson",
    StudioTitle: "studioTitle",
    StudioDescription: "studioDescription",
    StudioFeaturesJson: "studioFeaturesJson",
    CanvasTitle: "canvasTitle",
    CanvasDescription: "canvasDescription",
    CanvasFeaturesJson: "canvasFeaturesJson",
    SecurityTitle: "securityTitle",
    SecurityDescription: "securityDescription",
    RoadmapTitle: "roadmapTitle",
    RoadmapDescription: "roadmapDescription",
    RoadmapJson: "roadmapJson",
    MissionTitle: "missionTitle",
    MissionDescription: "missionDescription",
} as const;

/** Convert public Go JSON field names to the backend's explicit update keys. */
export function serializeAboutContentPayload(
    source: Record<string, string>
): Record<string, string> {
    const payload: Record<string, string> = {};

    for (const [sourceKey, targetKey] of Object.entries(ABOUT_CONTENT_FIELD_MAP)) {
        if (sourceKey in source) {
            payload[targetKey] = source[sourceKey];
        } else if (targetKey in source) {
            payload[targetKey] = source[targetKey];
        }
    }

    return payload;
}
