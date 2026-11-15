/** Optional read-only semantics inspected from the exact compiled candidate. */
export interface CandidateWord {
  text: string;
  rect: [number, number, number, number];
  representation: "native_visible_word" | "verified_raster_word";
  selection: "whole_word";
}
export interface CandidateWordPage { page_num: number; width: number; height: number; words: CandidateWord[] }

export async function verifiedCandidateWords(file: Blob, sha256: string, value: unknown): Promise<CandidateWordPage[]> {
  if (!/^[a-f0-9]{64}$/.test(sha256) || !value || typeof value !== "object") return [];
  const metadata = value as Record<string, unknown>;
  if (metadata.version !== "platen_candidate_words.v1" || metadata.artifact_sha256 !== sha256 || !Array.isArray(metadata.pages) || metadata.pages.length > 100) return [];
  const bytes = await file.arrayBuffer();
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  if (actual !== sha256) return [];
  const pages: CandidateWordPage[] = [];
  let count = 0;
  for (const entry of metadata.pages) {
    if (!entry || typeof entry !== "object") return [];
    const page = entry as CandidateWordPage;
    if (page.page_num !== pages.length + 1 || !Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0 || !Array.isArray(page.words)) return [];
    const words: CandidateWord[] = [];
    for (const word of page.words) {
      if (!word || typeof word.text !== "string" || !word.text || Array.from(word.text).length > 256 || /[\s\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(word.text) || !Array.isArray(word.rect) || word.rect.length !== 4 || !word.rect.every(Number.isFinite) || word.selection !== "whole_word" || !["native_visible_word", "verified_raster_word"].includes(word.representation)) return [];
      const [x0,y0,x1,y1] = word.rect;
      if (x0 < 0 || y0 < 0 || x1 > page.width || y1 > page.height || x0 >= x1 || y0 >= y1 || words.some(w => x0 < w.rect[2] && x1 > w.rect[0] && y0 < w.rect[3] && y1 > w.rect[1])) return [];
      words.push({ text: word.text, rect: [...word.rect], representation: word.representation, selection: "whole_word" });
      if (++count > 1000) return [];
    }
    pages.push({ page_num: page.page_num, width: page.width, height: page.height, words });
  }
  return pages;
}
