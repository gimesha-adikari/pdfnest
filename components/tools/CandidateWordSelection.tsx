"use client";
import { useEffect, useRef, useState } from "react";
import { verifiedCandidateWords, type CandidateWordPage } from "@/lib/verifiedCandidateWords";

/** Whole-word semantic regions; never a fabricated character-position overlay. */
export default function CandidateWordSelection({ file, artifactSha256, metadata, page, imageSrc }: {
  file: File; artifactSha256: string; metadata: unknown; page: number; imageSrc: string;
}) {
  const [verified, setVerified] = useState<{ file: File; artifactSha256: string; metadata: unknown; pages: CandidateWordPage[] } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const container = root.current;
    setEnabled(false); setSelected(null); setQuery("");
    void verifiedCandidateWords(file, artifactSha256, metadata).then(pages => {
      if (!cancelled) setVerified({ file, artifactSha256, metadata, pages });
    }).catch(() => { if (!cancelled) setVerified(null); });
    return () => {
      cancelled = true;
      const selection = window.getSelection();
      if (selection?.anchorNode && container?.contains(selection.anchorNode)) selection.removeAllRanges();
    };
  }, [file, artifactSha256, metadata, page]);
  const current = verified?.file === file && verified.artifactSha256 === artifactSha256 && verified.metadata === metadata ? verified.pages.find(p => p.page_num === page) : null;
  function selectWord(element: HTMLElement, index: number) {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    setSelected(index);
  }
  return <div className="flex max-h-full max-w-full flex-col items-center gap-2 text-zinc-900">
    {current?.words.length ? <div className="flex flex-wrap items-center gap-3 text-sm">
      <label><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setSelected(null); window.getSelection()?.removeAllRanges(); }} /> Select whole words</label>
      {enabled && <><span>Click a word or Tab to it and press Enter, then Ctrl+C. Partial and phrase selection are unavailable.</span><label>Find selectable word <input aria-label="Find selectable word" value={query} onChange={e => setQuery(e.target.value)} className="rounded border bg-white px-2" style={{ color: "inherit" }} /></label><output aria-live="polite">{query ? `${current.words.filter(w => w.text.includes(query)).length} matches` : ""}</output></>}
    </div> : <p className="text-sm text-zinc-700">Text selection is unavailable for this page. The verified PDF can still be downloaded.</p>}
    <div ref={root} className="relative max-h-full max-w-full" role="group" aria-label="Verified PDF page with optional whole-word selection">
      <img src={imageSrc} alt={`Verified compiled PDF page ${page}`} className="block max-h-[54vh] max-w-full object-contain" draggable={false} />
      {enabled && current && <div className="absolute inset-0 overflow-hidden" style={{pointerEvents:"none"}} aria-label="Selectable PDF words">
        {current.words.map((word,index) => {
          const [x0,y0,x1,y1]=word.rect;
          return <span key={index} role="button" tabIndex={0} aria-label={`Select whole word ${word.text}`} aria-pressed={selected===index}
            data-candidate-word={word.representation}
            onPointerDown={e => { e.preventDefault(); e.currentTarget.focus(); selectWord(e.currentTarget,index); }}
            onKeyDown={e => {
              if (e.shiftKey && /^(Arrow|Home|End)/.test(e.key)) e.preventDefault();
              if (e.key==="Enter" || e.key===" " || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="a")) {
                e.preventDefault(); selectWord(e.currentTarget,index);
              }
            }}
            style={{position:"absolute",left:`${x0/current.width*100}%`,top:`${y0/current.height*100}%`,width:`${(x1-x0)/current.width*100}%`,height:`${(y1-y0)/current.height*100}%`,color:"transparent",fontSize:1,lineHeight:1,overflow:"hidden",whiteSpace:"nowrap",cursor:"text",pointerEvents:"auto",userSelect:"all",background: selected===index ? "#6366f160" : query && word.text.includes(query) ? "#fde04770" : undefined}}
            className="focus:outline-2 focus:outline-offset-1 focus:outline-indigo-600">{word.text}</span>;
        })}
      </div>}
    </div>
  </div>;
}
