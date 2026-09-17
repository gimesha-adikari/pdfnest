"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Save, X } from "lucide-react";
import { SharedEditor } from "@/components/editor-v2/SharedEditor";
import Logo from "@/components/ui/Logo";
import { DEFAULT_EDITOR_LANGUAGE, EditorLanguageChoice, EditorLayout } from "@/components/editor-v2/model";
import { studioVisualResolution } from "@/components/editor-v2/visualResolution";
import { EditorLanguageControl } from "@/components/editor-v2/EditorLanguageControl";
import { studioV2Api, studioV2PageTileURL, StudioEditorStateDTO, StudioJobClientError, StudioJobDTO, StudioVDMDTO, studioJobErrorInfo } from "@/lib/studio-v2/api";
import { editorCompileError, editorExtractionStartError, editorExtractionSubmissionFailure, editorExtractionView, shouldPollEditorExtraction } from "@/lib/studio-v2/editorExtractionState";

interface Props { sessionId: string; baseVersionId: string; documentName: string; documentVersion?: string; documentSaved?: boolean; vdm: StudioVDMDTO; selectedPageId?: string | null; newIdempotencyKey: (operation: string) => string; onBack: () => void; onCompiled: () => Promise<void> | void; }
const terminal = (job: StudioJobDTO) => ["succeeded", "failed", "cancelled"].includes(job.status);
const languageKey = (choice: EditorLanguageChoice) => `${choice.mode}:${choice.languages.join("+")}`;
const sessionLanguageKey = (session: string) => `studio-v2-editor-lang:${session}`;
const extractKey = (session: string, version: string, choice: EditorLanguageChoice) => `studio-v2-editor-extract:${session}:${version}:${languageKey(choice)}`;
const compileKey = (session: string, state: string) => `studio-v2-editor-compile:${session}:${state}`;

export const StudioV2EditWorkspace: React.FC<Props> = ({ sessionId, baseVersionId, documentName, documentVersion, documentSaved = true, vdm, selectedPageId, newIdempotencyKey, onBack, onCompiled }) => {
  const [language, setLanguage] = useState<EditorLanguageChoice>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(sessionLanguageKey(sessionId));
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && (parsed.mode === "AUTO" || parsed.mode === "EXPLICIT") && Array.isArray(parsed.languages)) {
            return parsed;
          }
        }
      } catch {}
    }
    return DEFAULT_EDITOR_LANGUAGE;
  });
  const [job, setJob] = useState<StudioJobDTO | null>(null); const [state, setState] = useState<StudioEditorStateDTO | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState<string | null>(null); const [compileJob, setCompileJob] = useState<StudioJobDTO | null>(null); const [compileSubmitting, setCompileSubmitting] = useState(false); const [cancelSubmitting, setCancelSubmitting] = useState(false); const [dirty, setDirty] = useState(false); const extractStartedRef = useRef(false); const compileInFlightRef = useRef(false); const cancelInFlightRef = useRef(false);
  const selectedPageIndex = Math.max(0, vdm.pages.findIndex((page) => page.page_id === selectedPageId));
  const changeLanguage = (next: EditorLanguageChoice) => {
    if (!dirty || window.confirm("Discard unsaved edits and extract again with this language?")) {
      setDirty(false);
      setLanguage(next);
      try {
        window.localStorage.setItem(sessionLanguageKey(sessionId), JSON.stringify(next));
      } catch {}
    }
  };
  const loadState = useCallback(async (stateId: string) => { const response = await studioV2Api.getEditorState(sessionId, stateId); setState(response.editor_state); }, [sessionId]);
  const submitExtract = useCallback(async () => {
    if (extractStartedRef.current) return;
    extractStartedRef.current = true;
    try {
      const response = await studioV2Api.submitJob(sessionId, {
        base_version_id: baseVersionId,
        idempotency_key: newIdempotencyKey(`editor-extract-${languageKey(language)}`),
        operation: "editor_extract",
        parameters: { language_mode: language.mode, languages: language.languages }
      });
      setJob(response.job);
      window.localStorage.setItem(extractKey(sessionId, baseVersionId, language), response.job.id);
      if (response.job.status === "succeeded" && response.job.editor_state_id) {
        await loadState(response.job.editor_state_id);
      }
    } catch {
      const failure = editorExtractionSubmissionFailure();
      extractStartedRef.current = false;
      setJob(failure.job);
      setError(failure.error);
      throw new Error(failure.error);
    }
  }, [baseVersionId, language, loadState, newIdempotencyKey, sessionId]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setState(null);
      setJob(null);
      setError(null);
      setBusy(true);
      extractStartedRef.current = false;
      try {
        const saved = window.localStorage.getItem(extractKey(sessionId, baseVersionId, language));
        if (saved) {
          const response = await studioV2Api.getJob(sessionId, saved);
          if (!cancelled && response.job.status === "succeeded" && response.job.editor_state_id)
            await loadState(response.job.editor_state_id);
          else if (!cancelled && !terminal(response.job))
            setJob(response.job);
          else if (!cancelled)
            await submitExtract();
        } else await submitExtract();
      } catch {
        if (!cancelled) setError(editorExtractionStartError);
      }
    })().finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; };
  }, [baseVersionId, language, loadState, sessionId, submitExtract]);
  useEffect(() => {
    if (!job || !shouldPollEditorExtraction(job, Boolean(state))) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await studioV2Api.getJob(sessionId, job.id);
        if (cancelled) return;
        setJob(response.job);
        if (response.job.status === "succeeded" && response.job.editor_state_id) {
          await loadState(response.job.editor_state_id);
        } else if (terminal(response.job)) {
          setError(response.job.error_code === "LANGUAGE_REQUIRED" ? "Automatic language detection was uncertain. Choose English, Sinhala, or Tamil and retry." : response.job.error || "Editor extraction did not complete.");
        } else {
          timer = window.setTimeout(() => void poll(), 800);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to poll extraction.");
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job?.id, loadState, sessionId, state]);
  const retryExtract = useCallback(() => {
    if (busy || (job && !terminal(job))) return;
    window.localStorage.removeItem(extractKey(sessionId, baseVersionId, language));
    extractStartedRef.current = false;
    setJob(null);
    setError(null);
    setBusy(true);
    void submitExtract().catch(() => undefined).finally(() => setBusy(false));
  }, [baseVersionId, busy, job, language, sessionId, submitExtract]);
  const reportCompileFailure = useCallback((phase: "submit" | "poll", error: unknown, jobId?: string) => { const info = studioJobErrorInfo(error, phase); console.warn("[Studio V2] editor compile failure", { phase, category: info.category, status: info.status, code: info.code, session_id: sessionId, job_id: jobId }); }, [sessionId]);
  const compile = async (layout: EditorLayout) => { if (!state || compileInFlightRef.current) return; compileInFlightRef.current = true; setCompileSubmitting(true); setError(null); try { const response = await studioV2Api.submitJob(sessionId, { base_version_id: state.base_version_id, idempotency_key: newIdempotencyKey("editor-compile"), operation: "editor_compile", parameters: { editor_state_id: state.id, layout } }); setCompileJob(response.job); window.localStorage.setItem(compileKey(sessionId, state.id), response.job.id); } catch (error) { reportCompileFailure("submit", error); setError(editorCompileError); } finally { compileInFlightRef.current = false; setCompileSubmitting(false); } };
  useEffect(() => { if (!compileJob || terminal(compileJob)) return; let cancelled = false; let timer = 0; const poll = async () => { try { const response = await studioV2Api.getJob(sessionId, compileJob.id); if (cancelled) return; setCompileJob(response.job); if (response.job.status === "succeeded") { if (!response.job.result_version_id) { reportCompileFailure("poll", new StudioJobClientError("Reconciled compile had no result version.", "poll", "reconciliation_failed", 502), response.job.id); setError(editorCompileError); return; } window.localStorage.removeItem(compileKey(sessionId, state?.id ?? "")); await onCompiled(); } else if (response.job.status === "failed") { reportCompileFailure("poll", new StudioJobClientError("Worker compile failed.", "poll", "poll_failed_job", 200), response.job.id); setError(editorCompileError); } else if (response.job.status === "cancelled") { reportCompileFailure("poll", new StudioJobClientError("Worker compile was cancelled.", "poll", "poll_cancelled_job", 200), response.job.id); setError(editorCompileError); } else timer = window.setTimeout(() => void poll(), 800); } catch (error) { if (!cancelled) { reportCompileFailure("poll", error, compileJob.id); setError(editorCompileError); } } }; void poll(); return () => { cancelled = true; window.clearTimeout(timer); }; }, [compileJob?.id, onCompiled, reportCompileFailure, sessionId, state?.id]);
  useEffect(() => { if (!state || compileJob) return; const saved = window.localStorage.getItem(compileKey(sessionId, state.id)); if (!saved) return; let cancelled = false; void studioV2Api.getJob(sessionId, saved).then(async (response) => { if (cancelled) return; if (response.job.status === "succeeded") { if (!response.job.result_version_id) { reportCompileFailure("poll", new StudioJobClientError("Reconciled compile had no result version.", "poll", "reconciliation_failed", 502), saved); setError(editorCompileError); return; } window.localStorage.removeItem(compileKey(sessionId, state.id)); await onCompiled(); } else setCompileJob(response.job); }).catch((error) => { if (!cancelled) { reportCompileFailure("poll", error, saved); setError(editorCompileError); } }); return () => { cancelled = true; }; }, [compileJob, onCompiled, reportCompileFailure, sessionId, state]);
  const cancelJob = async (target: StudioJobDTO | null) => { if (!target || terminal(target) || cancelInFlightRef.current) return; cancelInFlightRef.current = true; setCancelSubmitting(true); try { const response = await studioV2Api.cancelJob(sessionId, target.id); if (target.id === job?.id) setJob(response.job); else setCompileJob(response.job); } finally { cancelInFlightRef.current = false; setCancelSubmitting(false); } };
  const extractionView = editorExtractionView({ busy, hasJob: Boolean(job), hasState: Boolean(state), error }); const compileBusy = Boolean(compileJob && !terminal(compileJob));
  const statusLabel = compileJob?.message || job?.message || (state ? (dirty ? "Unsaved changes" : "Saved") : "Extracting…");
  return <main className="studio-v2-editor-workspace" data-testid="studio-edit-workspace">
    <header className="studio-v2-editor-appbar" aria-label="Studio Editor document bar">
        <div className="studio-v2-editor-brand-group">
        <button type="button" aria-label="Back to Studio" className="studio-v2-editor-back" onClick={() => { if (!dirty || window.confirm("Discard unsaved edits?")) onBack(); }}><ArrowLeft size={17}/></button>
        <div className="studio-v2-editor-brand"><span className="studio-v2-editor-brand-mark"><Logo /></span><span><strong>PLATEN</strong><small>STUDIO · EDITOR V2</small></span></div>
        <div className="studio-v2-editor-document"><strong>{documentName}</strong></div>
        <span className="studio-v2-editor-version">{documentVersion ? `Version ${documentVersion.replace(/^Version\s*/i, "")}` : "Editor V2"}</span>
        <span className={`studio-v2-editor-status ${dirty ? "processing" : ""}`} role="status" aria-live="polite">{!dirty && documentSaved && <CheckCircle2 size={13}/>} {dirty ? "Unsaved" : documentSaved ? "Saved" : "Not saved"}</span>
      </div>
      <div className="studio-v2-editor-actions">
        <EditorLanguageControl value={language} onChange={changeLanguage} disabled={Boolean(job && !terminal(job))}/>
        <span className="studio-v2-editor-job-status" role="status" aria-live="polite">{statusLabel}</span>
        {((job && !terminal(job)) || compileBusy) && <button className="studio-v2-editor-cancel" aria-label="Cancel editor job" onClick={() => void cancelJob(compileBusy ? compileJob : job)} disabled={cancelSubmitting}><X size={14}/>{cancelSubmitting ? "Cancelling…" : "Cancel"}</button>}
        <button type="button" className="studio-v2-editor-compile" onClick={() => state && void compile(state.layout)} disabled={!state || compileSubmitting || compileBusy}>{compileSubmitting || compileBusy ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} {compileSubmitting || compileBusy ? "Compiling…" : "Compile"}</button>
      </div>
    </header>
    {error && <div role="alert" className="studio-v2-editor-error">{error}</div>}
    {!state ? <section className="studio-v2-editor-status-view">
      <div className={`studio-v2-editor-status-card ${extractionView === "failure" ? "error" : ""}`}>
        {extractionView === "failure" ? <><div className="studio-v2-editor-status-icon"><X size={19}/></div><h1>Editor extraction unavailable</h1><p>{error || editorExtractionStartError}</p><button className="studio-v2-editor-retry" data-testid="studio-editor-extraction-retry" onClick={retryExtract}>Retry extraction</button></> : <><Loader2 className="studio-v2-editor-spinner"/><h1>Preparing Editor V2</h1><p>Extracting the editable layout… {job?.progress ?? 0}%</p></>}
      </div>
    </section> : <section className="studio-v2-editor-main"><SharedEditor baseline={state.layout} initialPageIndex={selectedPageIndex} renderPageVisual={(index, visual) => { const descriptor = vdm.pages[index]; const page = state.layout.pages[index]; if (!descriptor || !page) return null; const resolution = studioVisualResolution({ pageWidthPt: page.width, zoom: visual.zoom, devicePixelRatio: visual.devicePixelRatio }); return <img src={studioV2PageTileURL(sessionId, baseVersionId, descriptor.page_id, resolution.scale)} alt={`Page ${index + 1}`} className="h-full w-full object-fill" draggable={false}/>; }} onCompile={compile} compiling={compileSubmitting || compileBusy} showPageSidebar onDirtyChange={setDirty}/></section>}
  </main>;
};
