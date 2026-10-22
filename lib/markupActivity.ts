/** Local UI exclusion only; backend admission remains authoritative. */
export type MarkupActivity = Readonly<{ kind: "preview" | "submission" }>;

export class MarkupActivityGate {
    private current: MarkupActivity | null = null;

    begin(kind: MarkupActivity["kind"]): MarkupActivity | null {
        if (this.current) return null;
        this.current = { kind };
        return this.current;
    }

    owns(activity: MarkupActivity): boolean {
        return this.current === activity;
    }

    finish(activity: MarkupActivity): boolean {
        if (!this.owns(activity)) return false;
        this.current = null;
        return true;
    }
}

const fileIds = new WeakMap<File, number>();
let nextFileId = 0;

/** Metadata twins must never share OCR evidence. No file contents are retained. */
export function markupPreviewKey(file: File, language: string, page: number): string {
    let id = fileIds.get(file);
    if (id === undefined) {
        id = ++nextFileId;
        fileIds.set(file, id);
    }
    return `${id}:${language}:${page}`;
}
