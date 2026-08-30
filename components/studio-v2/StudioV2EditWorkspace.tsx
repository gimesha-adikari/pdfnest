"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RotateCcw, Save, X } from "lucide-react";
import {
  studioV2Api,
  StudioEditorElementDTO,
  StudioEditorLayoutDTO,
  StudioEditorStateDTO,
  StudioJobDTO,
} from "@/lib/studio-v2/api";

interface Props {
  sessionId: string;
  baseVersionId: string;
  documentName: string;
  newIdempotencyKey: (operation: string) => string;
  onBack: () => void;
  onCompiled: () => Promise<void> | void;
}

const terminal = (job: StudioJobDTO) => ["succeeded", "failed", "cancelled"].includes(job.status);
const extractKey = (session: string) => `studio-v2-editor-extract:${session}`;
const compileKey = (session: string, state: string) => `studio-v2-editor-compile:${session}:${state}`;

export const StudioV2EditWorkspace: React.FC<Props> = ({ sessionId, baseVersionId, documentName, newIdempotencyKey, onBack, onCompiled }) => {
  const [job, setJob] = useState<StudioJobDTO | null>(null);
  const [state, setState] = useState<StudioEditorStateDTO | null>(null);
  const [layout, setLayout] = useState<StudioEditorLayoutDTO | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compileJob, setCompileJob] = useState<StudioJobDTO | null>(null);
  const [compileSubmitting, setCompileSubmitting] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const extractStartedRef = useRef(false);
  const compileInFlightRef = useRef(false);
  const cancelInFlightRef = useRef(false);

  const loadState = useCallback(async (stateId: string) => {
    const response = await studioV2Api.getEditorState(sessionId, stateId);
    setState(response.editor_state);
    setLayout(response.editor_state.layout);
    setPageIndex(0);
    setSelectedId(response.editor_state.layout.pages[0]?.elements[0]?.id ?? null);
  }, [sessionId]);

  const submitExtract = useCallback(async () => {
    if (extractStartedRef.current) return;
    extractStartedRef.current = true;
    try {
      const response = await studioV2Api.submitJob(sessionId, {
        base_version_id: baseVersionId,
        idempotency_key: newIdempotencyKey("editor-extract"),
        operation: "editor_extract",
        parameters: {},
      });
      setJob(response.job);
      window.localStorage.setItem(extractKey(sessionId), response.job.id);
    } catch (error) {
      extractStartedRef.current = false;
      throw error;
    }
  }, [baseVersionId, newIdempotencyKey, sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = window.localStorage.getItem(extractKey(sessionId));
        if (saved) {
          const response = await studioV2Api.getJob(sessionId, saved);
          if (!cancelled && response.job.status === "succeeded" && response.job.editor_state_id) await loadState(response.job.editor_state_id);
          else if (!cancelled && !terminal(response.job)) setJob(response.job);
          else if (!cancelled) await submitExtract();
        } else await submitExtract();
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Unable to start editor extraction."); }
    })().finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [loadState, sessionId, submitExtract]);

  useEffect(() => {
    if (!job || terminal(job) || state) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await studioV2Api.getJob(sessionId, job.id);
        if (cancelled) return;
        setJob(response.job);
        if (response.job.status === "succeeded" && response.job.editor_state_id) {
          window.localStorage.removeItem(extractKey(sessionId));
          await loadState(response.job.editor_state_id);
        } else if (response.job.status === "failed" || response.job.status === "cancelled") {
          setError(response.job.error || "Editor extraction did not complete.");
        } else window.setTimeout(() => void poll(), 800);
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Unable to poll extraction."); }
    };
    void poll();
    return () => { cancelled = true; };
  }, [job, loadState, sessionId, state]);

  const page = layout?.pages[pageIndex] ?? null;
  const pages = layout?.pages ?? [];
  const selected = useMemo(() => page?.elements.find((element) => element.id === selectedId) ?? null, [page, selectedId]);
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query || !layout) return [] as Array<{ pageIndex: number; element: StudioEditorElementDTO }>;
    return layout.pages.flatMap((candidate, candidateIndex) => candidate.elements
      .filter((element) => element.text.toLocaleLowerCase().includes(query))
      .map((element) => ({ pageIndex: candidateIndex, element })));
  }, [layout, searchQuery]);
  const updateSelected = (patch: Partial<StudioEditorElementDTO>) => {
    if (!layout || !selectedId) return;
    setLayout({ ...layout, pages: layout.pages.map((candidate, index) => index !== pageIndex ? candidate : {
      ...candidate, elements: candidate.elements.map((element) => element.id === selectedId ? { ...element, ...patch } : element),
    }) });
  };
  const dirty = Boolean(state && layout && JSON.stringify(state.layout) !== JSON.stringify(layout));
  const compileBusy = Boolean(compileJob && !terminal(compileJob));

  const compile = async () => {
    if (!state || !layout || compileBusy || compileInFlightRef.current) return;
    compileInFlightRef.current = true;
    setCompileSubmitting(true);
    setError(null);
    try {
      const response = await studioV2Api.submitJob(sessionId, {
        base_version_id: state.base_version_id,
        idempotency_key: newIdempotencyKey("editor-compile"),
        operation: "editor_compile",
        parameters: { editor_state_id: state.id, layout },
      });
      setCompileJob(response.job);
      window.localStorage.setItem(compileKey(sessionId, state.id), response.job.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to compile editor changes."); }
    finally {
      compileInFlightRef.current = false;
      setCompileSubmitting(false);
    }
  };

  useEffect(() => {
    if (!compileJob || terminal(compileJob)) return;
    let cancelled = false;
    const poll = async () => {
      const response = await studioV2Api.getJob(sessionId, compileJob.id);
      if (cancelled) return;
      setCompileJob(response.job);
      if (response.job.status === "succeeded") { window.localStorage.removeItem(compileKey(sessionId, state?.id ?? "")); await onCompiled(); }
      else if (response.job.status === "failed" || response.job.status === "cancelled") setError(response.job.error || "Compilation did not complete.");
      else window.setTimeout(() => void poll(), 800);
    };
    void poll();
    return () => { cancelled = true; };
  }, [compileJob, onCompiled, sessionId, state?.id]);

  useEffect(() => {
    if (!state || compileJob) return;
    const saved = window.localStorage.getItem(compileKey(sessionId, state.id));
    if (!saved) return;
    let cancelled = false;
    void studioV2Api.getJob(sessionId, saved).then(async (response) => {
      if (cancelled) return;
      if (response.job.status === "succeeded") {
        window.localStorage.removeItem(compileKey(sessionId, state.id));
        await onCompiled();
      } else {
        setCompileJob(response.job);
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Unable to recover editor compilation.");
    });
    return () => { cancelled = true; };
  }, [compileJob, onCompiled, sessionId, state]);

  const cancelJob = async (target: StudioJobDTO | null) => {
    if (!target || terminal(target) || cancelInFlightRef.current) return;
    cancelInFlightRef.current = true;
    setCancelSubmitting(true);
    try {
      const response = await studioV2Api.cancelJob(sessionId, target.id);
      if (target.id === job?.id) setJob(response.job); else setCompileJob(response.job);
    } finally {
      cancelInFlightRef.current = false;
      setCancelSubmitting(false);
    }
  };

  if (busy && !job) return <div className="flex h-screen items-center justify-center bg-[#0B0C0F] text-white"><Loader2 className="mr-2 animate-spin" /> Extracting editor layout…</div>;
  return <main className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0C0F] text-[#F5F7FA]" data-testid="studio-edit-workspace">
    <header className="flex min-h-14 items-center justify-between border-b border-[#292D35] bg-[#101216] px-4">
      <div className="flex items-center gap-3"><button type="button" aria-label="Back to Studio" onClick={onBack} className="rounded p-2 hover:bg-white/10"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-sm font-semibold">Edit PDF</h1><p className="text-[10px] text-[#9AA1AD]">{documentName} · text layout editor</p></div></div>
      <div className="flex items-center gap-2"><span role="status" aria-live="polite" className="text-xs text-[#9AA1AD]">{compileJob?.message || (state ? "Ready to edit" : job?.message || "Extracting…")} {job && !terminal(job) ? `${job.progress}%` : ""}</span>{state && !compileBusy && <button type="button" onClick={compile} disabled={!dirty || compileSubmitting} className="flex items-center gap-2 rounded bg-violet-600 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">{compileSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {compileSubmitting ? "Compiling…" : "Compile"}</button>}{(job && !terminal(job) || compileBusy) && <button type="button" aria-label="Cancel editor job" onClick={() => void cancelJob(compileBusy ? compileJob : job)} disabled={cancelSubmitting} className="rounded border border-red-400/40 px-3 py-2 text-xs text-red-200 disabled:opacity-40"><X className="mr-1 inline h-3.5 w-3.5" />{cancelSubmitting ? "Cancelling…" : "Cancel"}</button>}</div>
    </header>
    {error && <div role="alert" className="border-b border-red-400/30 bg-red-950/40 px-4 py-2 text-xs text-red-200">{error}</div>}
    {!state ? <section className="flex flex-1 flex-col items-center justify-center gap-3"><Loader2 className="animate-spin text-violet-300" /><p className="text-sm">Waiting for the editor layout…</p></section> : <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
      <aside className="min-h-0 overflow-y-auto rounded-xl border border-[#292D35] bg-[#101216] p-3"><h2 className="mb-3 text-xs font-semibold">Pages</h2>{layout?.pages.map((candidate, index) => <button type="button" key={candidate.page_num} onClick={() => { setPageIndex(index); setSelectedId(candidate.elements[0]?.id ?? null); }} aria-label={`Page ${candidate.page_num}`} className={`mb-2 w-full rounded border p-3 text-left text-xs ${index === pageIndex ? "border-violet-400 bg-violet-500/15" : "border-[#292D35]"}`}>Page {candidate.page_num}<span className="mt-1 block text-[10px] text-[#9AA1AD]">{candidate.elements.length} text elements</span></button>)}</aside>
      <div className="flex min-h-0 flex-col items-center overflow-auto rounded-xl border border-[#292D35] bg-[#17191F] p-6"><div className="mb-3 flex items-center gap-3 text-xs text-[#9AA1AD]"><button type="button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPageIndex((value) => value - 1)}><ChevronLeft /></button>Page {pageIndex + 1} of {pages.length}<button type="button" aria-label="Next page" disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex((value) => value + 1)}><ChevronRight /></button></div><div className="relative bg-white shadow-2xl" style={{ width: "min(100%, 842px)", aspectRatio: `${page?.width ?? 1}/${page?.height ?? 1}` }}><div className="absolute inset-0">{page?.elements.map((element) => <button type="button" key={element.id} aria-label={`Select text ${element.text}`} onClick={() => setSelectedId(element.id)} className={`absolute overflow-hidden border-2 px-1 text-left text-black ${element.id === selectedId ? "border-violet-600 bg-violet-200/50" : "border-transparent hover:border-violet-300"}`} style={{ left: `${(element.x / (page.width || 1)) * 100}%`, top: `${(element.y / (page.height || 1)) * 100}%`, width: `${(element.width / page.width) * 100}%`, height: `${(element.height / page.height) * 100}%`, fontSize: `${Math.max(8, element.size * 0.8)}px` }}>{element.text}</button>)}</div></div></div>
      <aside className="min-h-0 overflow-y-auto rounded-xl border border-[#292D35] bg-[#101216] p-4"><h2 className="mb-3 text-xs font-semibold">Text elements · Page {pageIndex + 1}</h2><label className="mb-3 block text-xs text-[#9AA1AD]">Search editor text<input aria-label="Search editor text" data-testid="studio-editor-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search text" className="mt-1 w-full rounded border border-[#3b3742] bg-[#0B0C0F] p-2 text-xs text-white" /></label><div data-testid="studio-editor-search-count" className="mb-3 text-[10px] text-[#9AA1AD]">{searchMatches.length} matches</div>{searchMatches[0] && <button type="button" onClick={() => { setPageIndex(searchMatches[0].pageIndex); setSelectedId(searchMatches[0].element.id); }} className="mb-3 rounded border border-violet-400/50 px-2 py-1.5 text-xs text-violet-200">Select first match</button>}{page?.elements.map((element) => <button type="button" key={element.id} onClick={() => setSelectedId(element.id)} className={`mb-2 block w-full truncate rounded border px-2 py-1.5 text-left text-xs ${element.id === selectedId ? "border-violet-400 text-white" : "border-[#292D35] text-[#9AA1AD]"}`}>{element.text}</button>)}{selected && <label className="mt-4 block text-xs text-[#9AA1AD]">Text<textarea aria-label="Edit selected text" data-testid="studio-edit-text" value={selected.text} onChange={(event) => updateSelected({ text: event.target.value })} rows={5} className="mt-1 w-full rounded border border-[#3b3742] bg-[#0B0C0F] p-2 text-xs text-white" /></label>}<button type="button" data-testid="studio-edit-back-discard" onClick={() => { if (dirty && !window.confirm("Discard unsaved edits?")) return; onBack(); }} className="mt-5 rounded border border-[#3b3742] px-3 py-2 text-xs"><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Back / Discard</button></aside>
    </section>}
  </main>;
};
