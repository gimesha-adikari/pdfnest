import type { VDMPageDescriptorDTO } from "@/lib/studio-v2/api";

export function parseStudioPageSelection(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter at least one page or range to keep.");
  const selected = new Set<number>();
  for (const rawToken of trimmed.split(",")) {
    const token = rawToken.trim();
    if (!token) throw new Error("Page selection contains an empty token.");
    let start: number;
    let end: number;
    if (/^\d+$/.test(token)) { start = Number(token); end = start; }
    else {
      const range = /^(\d+)-(\d+)$/.exec(token);
      if (!range) throw new Error(`Invalid page selection token: ${token}`);
      start = Number(range[1]); end = Number(range[2]);
      if (start > end) throw new Error(`Page range is reversed: ${token}`);
    }
    if (start < 1 || end > pageCount) throw new Error(`Pages must be between 1 and ${pageCount}.`);
    for (let page = start; page <= end; page += 1) {
      if (selected.has(page)) throw new Error(`Page ${page} is selected more than once.`);
      selected.add(page);
    }
  }
  return [...selected].sort((a, b) => a - b);
}

export function serializeStudioPageSelection(selectedPageIds: Set<string>, pages: VDMPageDescriptorDTO[]): string {
  const numbers = pages.map((page, index) => selectedPageIds.has(page.page_id) ? index + 1 : 0).filter(Boolean);
  const ranges: string[] = [];
  for (let index = 0; index < numbers.length;) {
    const start = numbers[index];
    let end = start;
    while (index + 1 < numbers.length && numbers[index + 1] === end + 1) { index += 1; end = numbers[index]; }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    index += 1;
  }
  return ranges.join(",");
}

export function pageIdsForSelection(numbers: number[], pages: VDMPageDescriptorDTO[]): Set<string> {
  return new Set(numbers.map((number) => pages[number - 1]?.page_id).filter((id): id is string => Boolean(id)));
}

export function toggleStudioPageSelection(pages: VDMPageDescriptorDTO[], selected: Set<string>, pageId: string, shift: boolean, anchorId: string | null): { selected: Set<string>; anchorId: string } {
  const next = new Set(selected);
  const pageIndex = pages.findIndex((page) => page.page_id === pageId);
  const anchorIndex = anchorId ? pages.findIndex((page) => page.page_id === anchorId) : -1;
  if (shift && pageIndex >= 0 && anchorIndex >= 0) {
    const shouldSelect = selected.has(anchorId!);
    for (let index = Math.min(pageIndex, anchorIndex); index <= Math.max(pageIndex, anchorIndex); index += 1) {
      if (shouldSelect) next.add(pages[index].page_id); else next.delete(pages[index].page_id);
    }
  } else if (next.has(pageId)) next.delete(pageId);
  else next.add(pageId);
  return { selected: next, anchorId: shift && anchorId ? anchorId : pageId };
}

export function pruneStudioPageSelection(selected: Set<string>, pages: VDMPageDescriptorDTO[]): Set<string> {
  const valid = new Set(pages.map((page) => page.page_id));
  return new Set([...selected].filter((id) => valid.has(id)));
}
