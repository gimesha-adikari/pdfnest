import type { Metadata } from "next";

export const NO_INDEX_FOLLOW_ROBOTS: NonNullable<Metadata["robots"]> = {
    index: false,
    follow: true,
};

type NoIndexMetadataOptions = {
    canonical?: string | null;
    description?: string;
    title?: string;
};

/**
 * Shared metadata for routes that are useful to the application but are not
 * search-result pages. A null canonical explicitly clears a parent layout's
 * canonical (for example, a tool workspace or download state).
 */
export function buildNoIndexMetadata(options: NoIndexMetadataOptions = {}): Metadata {
    const metadata: Metadata = {
        robots: NO_INDEX_FOLLOW_ROBOTS,
    };

    if (options.title) metadata.title = options.title;
    if (options.description) metadata.description = options.description;
    if ("canonical" in options) {
        metadata.alternates = { canonical: options.canonical };
    }

    return metadata;
}
