export const MARKUP_COORDINATE_SPACE = "pdf_points_visible_cropbox_top_left" as const;

export interface MarkupSelectionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MarkupSelectionGeometry {
    page: number;
    source: "native" | "ocr";
    coordinate_space: string;
    page_width: number;
    page_height: number;
    rotation: number;
    crop_box?: number[] | null;
    word_ids: string[];
    rects: MarkupSelectionRect[];
    text: string;
}

interface ClientRectLike {
    left: number;
    top: number;
    width: number;
    height: number;
}

function finite(value: number): boolean {
    return Number.isFinite(value);
}

function clampRect(rect: MarkupSelectionRect, pageWidth: number, pageHeight: number): MarkupSelectionRect | null {
    if (!finite(pageWidth) || !finite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) return null;
    const left = Math.max(0, Math.min(pageWidth, rect.x));
    const top = Math.max(0, Math.min(pageHeight, rect.y));
    const right = Math.max(left, Math.min(pageWidth, rect.x + rect.width));
    const bottom = Math.max(top, Math.min(pageHeight, rect.y + rect.height));
    if (right - left <= 0 || bottom - top <= 0) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Group rectangles by visual line without merging separate lines. */
export function groupMarkupSelectionRects(
    rects: readonly MarkupSelectionRect[],
    pageWidth?: number,
    pageHeight?: number,
): MarkupSelectionRect[] {
    const valid = rects.flatMap((rect) => {
        const normalized = pageWidth && pageHeight ? clampRect(rect, pageWidth, pageHeight) : rect;
        return normalized && finite(normalized.x) && finite(normalized.y) && finite(normalized.width) && finite(normalized.height) && normalized.width > 0 && normalized.height > 0
            ? [normalized]
            : [];
    });
    const groups: Array<{ rects: MarkupSelectionRect[]; top: number; bottom: number; center: number }> = [];

    for (const rect of valid) {
        const center = rect.y + rect.height / 2;
        const candidate = groups
            .map((group) => ({ group }))
            .filter(({ group }) => {
                const overlap = Math.min(rect.y + rect.height, group.bottom) - Math.max(rect.y, group.top);
                const tolerance = Math.max(rect.height, group.bottom - group.top) * 0.6;
                return overlap > 0 || Math.abs(center - group.center) <= tolerance;
            })
            .sort((left, right) => Math.abs(left.group.center - center) - Math.abs(right.group.center - center))[0];

        if (!candidate) {
            groups.push({ rects: [rect], top: rect.y, bottom: rect.y + rect.height, center });
            continue;
        }

        const group = candidate.group;
        group.rects.push(rect);
        group.top = Math.min(group.top, rect.y);
        group.bottom = Math.max(group.bottom, rect.y + rect.height);
        group.center = (group.top + group.bottom) / 2;
    }

    return groups.map((group) => {
        const left = Math.min(...group.rects.map((rect) => rect.x));
        const top = Math.min(...group.rects.map((rect) => rect.y));
        const right = Math.max(...group.rects.map((rect) => rect.x + rect.width));
        const bottom = Math.max(...group.rects.map((rect) => rect.y + rect.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
    });
}

export function clientRectsToMarkupSelectionRects(
    rects: readonly ClientRectLike[],
    frame: { left: number; top: number; width: number; height: number },
    pageWidth: number,
    pageHeight: number,
): MarkupSelectionRect[] {
    if (!finite(frame.width) || !finite(frame.height) || frame.width <= 0 || frame.height <= 0) return [];
    const mapped = rects.map((rect) => ({
        x: (rect.left - frame.left) * pageWidth / frame.width,
        y: (rect.top - frame.top) * pageHeight / frame.height,
        width: rect.width * pageWidth / frame.width,
        height: rect.height * pageHeight / frame.height,
    }));
    return groupMarkupSelectionRects(mapped, pageWidth, pageHeight);
}

export function wordRectsToMarkupSelectionRects(
    words: readonly { id: string; x: number; y: number; width: number; height: number }[],
    selectedWordIds: readonly string[],
    pageWidth: number,
    pageHeight: number,
): MarkupSelectionRect[] {
    const selected = new Set(selectedWordIds);
    return groupMarkupSelectionRects(
        words.filter((word) => selected.has(word.id)).map(({ x, y, width, height }) => ({ x, y, width, height })),
        pageWidth,
        pageHeight,
    );
}

export function selectedWordElements(root: ParentNode, range: Range): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>("[data-word-id]"))
        .filter((element) => {
            try {
                return range.intersectsNode(element);
            } catch {
                return false;
            }
        });
}

export function normalizeMarkupSelectionText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}
