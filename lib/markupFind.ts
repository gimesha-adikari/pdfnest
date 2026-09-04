export interface MarkupFindMatch {
    text: string;
    startIndex: number;
    endIndex: number;
}

interface IndexedTextPart {
    index: number;
    text: string;
}

function normalized(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function findIndexedMatches(parts: readonly IndexedTextPart[], query: string): MarkupFindMatch[] {
    const needle = normalized(query).toLocaleLowerCase();
    if (!needle) return [];

    const usable = parts
        .map((part) => ({ ...part, text: normalized(part.text) }))
        .filter((part) => part.text.length > 0);
    if (usable.length === 0) return [];

    const haystack = usable.map((part) => part.text).join(" ").toLocaleLowerCase();
    const offsets: Array<{ start: number; end: number; index: number }> = [];
    let offset = 0;
    for (const part of usable) {
        offsets.push({ start: offset, end: offset + part.text.length, index: part.index });
        offset += part.text.length + 1;
    }

    const matches: MarkupFindMatch[] = [];
    let cursor = 0;
    while (cursor <= haystack.length - needle.length) {
        const start = haystack.indexOf(needle, cursor);
        if (start < 0) break;
        const end = start + needle.length;
        const covered = offsets.filter((part) => part.end > start && part.start < end);
        if (covered.length > 0) {
            const matchedParts = usable.filter((part) => covered.some((item) => item.index === part.index));
            matches.push({
                text: matchedParts.map((part) => part.text).join(" "),
                startIndex: covered[0].index,
                endIndex: covered[covered.length - 1].index,
            });
        }
        // Advance by one so overlapping occurrences are still discoverable.
        cursor = start + 1;
    }
    return matches;
}

export function findWordMatches(words: readonly { text: string }[], query: string): MarkupFindMatch[] {
    return findIndexedMatches(words.map((word, index) => ({ index, text: word.text })), query);
}

export function findTextItemMatches(items: readonly { str: string }[], query: string): MarkupFindMatch[] {
    return findIndexedMatches(items.map((item, index) => ({ index, text: item.str })), query);
}
