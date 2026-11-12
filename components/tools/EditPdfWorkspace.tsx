"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { type EditPdfEditorEngine, resolveEditPdfEditorEngine } from "@/lib/editPdfEngine";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import JobProgressCard from "@/components/studio/ui/JobProgressCard";
import { EditorVisualContext, SharedEditor } from "@/components/editor-v2/SharedEditor";
import { DEFAULT_EDITOR_LANGUAGE, EditorLanguageChoice, EditorLayout, EditorPage } from "@/components/editor-v2/model";
import { canReusePreparedWordEdit, isCurrentWordEditPreparation, type PreparedWordEditIdentity, type WordEditRequest } from "@/components/editor-v2/wordEdits";
import { wordEditFailureMessage } from "@/components/editor-v2/wordEditErrors";
import { studioVisualResolution } from "@/components/editor-v2/visualResolution";
import { EditorLanguageControl } from "@/components/editor-v2/EditorLanguageControl";
import { downloadEditorJob, EditorJobRecord, submitEditorCompile, submitEditorExtract, verifyWordEditArtifact, waitForEditorJob } from "@/lib/editorJobs";
import { notify } from "@/lib/notify";
import { assertCloudProcessingAuthorized, hasProtectedPdfInputLineage, markCloudSubmissionInitiated, type PdfResultProvenance } from "@/lib/security/pdfInputPreparation";
import { handleClientError } from "@/lib/errorHandler";
import { captureCloudPdfOutputRestoration } from "@/lib/api";
import { usePdfOutputOperation } from "@/lib/security/usePdfOutputOperation";
import { usePreviews } from "@/lib/preview/usePreviews";
import { getPreviewFileIdentity } from "@/lib/preview/types";

interface ActiveStandalonePageProps {
  file: File;
  page: EditorPage;
  visual: EditorVisualContext;
}

function ActiveStandalonePage({ file, page, visual }: ActiveStandalonePageProps) {
  const resolution = useMemo(
    () =>
      studioVisualResolution({
        pageWidthPt: page.width,
        zoom: visual.zoom,
        devicePixelRatio: visual.devicePixelRatio,
      }),
    [page.width, visual.zoom, visual.devicePixelRatio]
  );
  const requests = useMemo(
    () => [
      {
        file,
        page: page.page_num,
        scale: resolution.scale,
        renderer: "server" as const,
        enabled: true,
      },
    ],
    [file, page.page_num, resolution.scale]
  );
  const result = usePreviews(requests)[0];
  const [cachedSrc, setCachedSrc] = useState<string>("");
  if (result?.src && result.src !== cachedSrc) {
    setCachedSrc(result.src);
  }
  const displaySrc = result?.src || cachedSrc;

  return displaySrc ? (
    <img
      src={displaySrc}
      alt={`Page ${page.page_num}`}
      className="h-full w-full object-fill"
      draggable={false}
    />
  ) : (
    <div className="flex h-full items-center justify-center bg-zinc-100">
      <Loader2 className="animate-spin text-indigo-500" />
    </div>
  );
}

interface PreparedWordEditCandidate extends PreparedWordEditIdentity {
  file: File;
  blob: Blob;
  fileName: string;
  artifactSha256: string;
  pageCount: number;
  provenance: PdfResultProvenance;
}

function VerifiedCandidatePage({
  file,
  page,
  onReady,
  onError,
}: {
  file: File;
  page: number;
  onReady: (file: File, page: number) => void;
  onError: (file: File, page: number, message: string) => void;
}) {
  const requests = useMemo(() => [{ file, page, scale: 2, renderer: "server" as const, enabled: true }], [file, page]);
  const result = usePreviews(requests)[0];
  useEffect(() => {
    if (result?.src) onReady(file, page);
    else if (result?.error) onError(file, page, result.error.message || "The prepared PDF page could not be rendered.");
  }, [file, onError, onReady, page, result?.error, result?.src]);

  if (result?.error) return <div role="alert" className="p-5 text-red-700">Verified preview failed: {result.error.message || "The prepared PDF page could not be rendered."}</div>;
  if (result?.src) return <img src={result.src} alt={`Verified compiled PDF page ${page}`} className="mx-auto max-h-full max-w-full object-contain" draggable={false} />;
  return <div className="flex min-h-96 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="animate-spin"/>Rendering the compiled PDF page…</div>;
}

export interface EditPdfWorkspaceProps {
  engine?: EditPdfEditorEngine;
}

export default function EditPdfWorkspace({ engine }: EditPdfWorkspaceProps = {}) {
  const { requireAuth } = useAuth();
  const router = useRouter();
  const { file: sharedFile, setDownloadData, toolId, editPdfEngine: contextEngine } = useSharedTool();
  const resolvedEngine = engine ?? contextEngine ?? resolveEditPdfEditorEngine();
  const useOcrV2 = resolvedEngine === "v2";
  const file = sharedFile as File | null;
  const beginOutput = usePdfOutputOperation(file, toolId || "edit-pdf", () => setDownloadData(null));
  const [language, setLanguage] = useState<EditorLanguageChoice>(DEFAULT_EDITOR_LANGUAGE);
  const [layout, setLayout] = useState<EditorLayout | null>(null);
  const [extractJob, setExtractJob] = useState<EditorJobRecord | null>(null);
  const [sourceTracker, setSourceTracker] = useState("");
  const [compilingSource, setCompilingSource] = useState<File | null>(null);
  const compiling = Boolean(file && compilingSource === file);
  const setCompiling = (value: boolean) => setCompilingSource(value ? file : null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const editorRevisionRef = useRef(0);
  const [preparedCandidate, setPreparedCandidate] = useState<PreparedWordEditCandidate | null>(null);
  const preparedCandidateRef = useRef<PreparedWordEditCandidate | null>(null);
  const [showCandidatePreview, setShowCandidatePreview] = useState(false);
  const [candidatePage, setCandidatePage] = useState(1);
  const candidatePageRef = useRef(1);
  const [candidatePreviewReady, setCandidatePreviewReady] = useState(false);
  const [candidatePreviewError, setCandidatePreviewError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const publishCandidate = useCallback((candidate: PreparedWordEditCandidate | null) => {
    preparedCandidateRef.current = candidate;
    setPreparedCandidate(candidate);
  }, []);
  const onEditorRevisionChange = useCallback((revision: number) => {
    if (editorRevisionRef.current === revision) return;
    editorRevisionRef.current = revision;
    const current = preparedCandidateRef.current;
    if (current && current.revision !== revision) {
      publishCandidate(null);
      setShowCandidatePreview(false);
      setCandidatePreviewReady(false);
      setCandidatePreviewError(null);
      setError("The prepared PDF was discarded because the edits changed. Prepare a new export to preview the latest words.");
    }
  }, [publishCandidate]);
  const selectCandidatePage = useCallback((page: number) => {
    candidatePageRef.current = page;
    setCandidatePage(page);
    setCandidatePreviewReady(false);
    setCandidatePreviewError(null);
  }, []);
  const candidatePreviewLoaded = useCallback((candidateFile: File, page: number) => {
    const current = preparedCandidateRef.current;
    if (!current || current.file !== candidateFile || candidatePageRef.current !== page) return;
    setCandidatePreviewReady(true);
    setCandidatePreviewError(null);
  }, []);
  const candidatePreviewFailed = useCallback((candidateFile: File, page: number, message: string) => {
    const current = preparedCandidateRef.current;
    if (!current || current.file !== candidateFile || candidatePageRef.current !== page) return;
    setCandidatePreviewReady(false);
    setCandidatePreviewError(message);
  }, []);
  const retryExtraction = () => {
    setError(null);
    setExtractJob(null);
    setRetryCount((c) => c + 1);
  };
  const changeLanguage = (next: EditorLanguageChoice) => {
    if (!dirty || window.confirm("Discard unsaved edits and extract again with this language?")) { setDirty(false); setLanguage(next); }
  };

  useEffect(() => {
    if (!file) {
      publishCandidate(null);
      setShowCandidatePreview(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      editorRevisionRef.current = 0;
      publishCandidate(null);
      setShowCandidatePreview(false);
      candidatePageRef.current = 1;
      setCandidatePage(1);
      setCandidatePreviewReady(false);
      setCandidatePreviewError(null);
      setLayout(null); setError(null); setExtractJob(null); setSourceTracker("");
      try {
        assertCloudProcessingAuthorized(file, toolId || "edit-pdf");
        const form = new FormData(); form.append("file", file);
        if (useOcrV2) { form.append("ocr_v2", "true"); form.append("language_mode", language.mode); form.append("languages", language.languages.join(",")); }
        const submitted = await submitEditorExtract(form);
        if (cancelled) return;
        setSourceTracker(submitted.source_tracker ?? "");
        const job = await waitForEditorJob(submitted.job_id, (next) => { if (!cancelled) setExtractJob(next); }, controller.signal);
        if (cancelled) return;
        if (job.status === "succeeded" && job.result) setLayout(job.result as unknown as EditorLayout);
        else setError(job.error_code === "LANGUAGE_REQUIRED" ? "Automatic language detection was uncertain. Choose a language and retry." : job.error || "Layout extraction failed.");
      } catch (err) { if (!cancelled && !controller.signal.aborted) { setError("Failed to extract the editor layout."); handleClientError(err); } }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [file, language, publishCandidate, retryCount, toolId, useOcrV2]);

  const compileLayoutRequest = (request: unknown) => {
    if (!file) return;
    setDownloadData(null);
    const restoreOutput = captureCloudPdfOutputRestoration(file, toolId || "edit-pdf");
    void requireAuth(async () => {
      const operation = beginOutput();
      if (!operation) return;
      setCompiling(true); setError(null);
      try {
        assertCloudProcessingAuthorized(operation.file, toolId || "edit-pdf");
        markCloudSubmissionInitiated([operation.file]);
        const submitted = await submitEditorCompile(request);
        if (!operation.isCurrent()) return;
        const job = await waitForEditorJob(submitted.job_id, undefined, operation.signal);
        if (!operation.isCurrent()) return;
        if (job.status !== "succeeded") {
          throw new Error(job.error || "Compilation failed");
        }
        const downloaded = await downloadEditorJob(job.id);
        if (!operation.isCurrent()) return;
        const blob = await restoreOutput(downloaded, operation.signal);
        if (!operation.isCurrent()) return;
        setDownloadData({ blob, fileName: `edited_${operation.file.name}`, provenance: operation.provenance() });
        notify("PDF compiled successfully!", "success");
        router.replace(`/${toolId || "edit-pdf"}/download`);
      } catch (err) {
        if (!operation.isCurrent()) return;
        const message = String(err).toLowerCase();
        if (message.includes("source_not_found") || message.includes("nosuchkey") || message.includes("does not exist")) {
          notify("This editing session has expired. Please upload the PDF again.", "error");
          router.replace(`/${toolId || "edit-pdf"}`);
        } else {
          setError("Compilation or password protection verification failed. No result is available. Please retry.");
          handleClientError(err);
        }
      } finally {
        if (operation.isCurrent()) setCompiling(false);
        operation.finish();
      }
    });
  };

  const compile = (draft: EditorLayout) => {
    compileLayoutRequest({ ...draft, source_tracker: sourceTracker });
  };

  const prepareWordExport = (request: WordEditRequest, revision: number) => {
    if (!file || !layout) return;
    if (hasProtectedPdfInputLineage(file)) {
      setError("Verified word-edit preview is unavailable for password-protected or protected-derived PDFs because the preview service cannot render the restored candidate with its password. No compilation was submitted.");
      return;
    }
    const requestSignature = JSON.stringify(request);
    const existing = preparedCandidateRef.current;
    if (canReusePreparedWordEdit(existing, file, revision, requestSignature)) {
      setError(null);
      setShowCandidatePreview(true);
      return;
    }
    publishCandidate(null);
    setCandidatePreviewReady(false);
    setCandidatePreviewError(null);
    setDownloadData(null);
    setShowCandidatePreview(false);
    const restoreOutput = captureCloudPdfOutputRestoration(file, toolId || "edit-pdf");
    void requireAuth(async () => {
      const operation = beginOutput();
      if (!operation) return;
      const requestIsCurrent = () => isCurrentWordEditPreparation(
        { source: operation.file, revision },
        { source: file, revision: editorRevisionRef.current },
        operation.isCurrent(),
      );
      setCompiling(true); setError(null);
      try {
        assertCloudProcessingAuthorized(operation.file, toolId || "edit-pdf");
        markCloudSubmissionInitiated([operation.file]);
        const submitted = await submitEditorCompile(request);
        if (!requestIsCurrent()) return;
        const job = await waitForEditorJob(submitted.job_id, undefined, operation.signal);
        if (!requestIsCurrent()) return;
        if (job.status !== "succeeded") {
          setError(wordEditFailureMessage(job.error_code, job.error));
          return;
        }
        const workerResult = job.result ?? {};
        if (
          workerResult.baseline_digest !== request.baseline_digest ||
          workerResult.source_sha256 !== layout.word_edit_baseline?.source_sha256 ||
          workerResult.validated_operation_count !== request.edits.length
        ) {
          throw new Error("The worker result does not match the submitted source baseline and word operations.");
        }
        const downloaded = await downloadEditorJob(job.id);
        if (!requestIsCurrent()) return;
        const verified = await verifyWordEditArtifact(downloaded, workerResult, layout.pages.length);
        if (!requestIsCurrent()) return;
        const restored = await restoreOutput(downloaded, operation.signal);
        if (!requestIsCurrent()) return;
        // Preview and download must refer to the exact same verified bytes.
        await verifyWordEditArtifact(restored, workerResult, layout.pages.length);
        if (!requestIsCurrent()) return;
        const fileName = `edited_${operation.file.name}`;
        const candidateFile = new File([restored], fileName, { type: "application/pdf", lastModified: Date.now() });
        const candidate: PreparedWordEditCandidate = {
          source: operation.file,
          revision,
          requestSignature,
          file: candidateFile,
          blob: restored,
          fileName,
          artifactSha256: verified.artifactSha256,
          pageCount: verified.pageCount,
          provenance: operation.provenance(),
        };
        publishCandidate(candidate);
        selectCandidatePage(1);
        setCandidatePreviewReady(false);
        setCandidatePreviewError(null);
        setShowCandidatePreview(true);
      } catch (err) {
        if (!requestIsCurrent()) return;
        const message = String(err).toLowerCase();
        if (message.includes("source_not_found") || message.includes("nosuchkey") || message.includes("does not exist")) {
          notify("This editing session has expired. Please upload the PDF again.", "error");
          router.replace(`/${toolId || "edit-pdf"}`);
        } else {
          const detail = err instanceof Error ? err.message : "The candidate PDF could not be verified.";
          setError(`${detail} No downloadable PDF is available.`);
          handleClientError(err);
        }
      } finally {
        if (operation.isCurrent()) setCompiling(false);
        operation.finish();
      }
    });
  };

  const downloadPreparedCandidate = () => {
    const candidate = preparedCandidateRef.current;
    if (!candidate || !candidatePreviewReady || candidate.source !== file || candidate.revision !== editorRevisionRef.current) return;
    setDownloadData({ blob: candidate.blob, fileName: candidate.fileName, provenance: candidate.provenance });
    notify("Verified PDF ready for download.", "success");
    router.replace(`/${toolId || "edit-pdf"}/download`);
  };

  const retryCandidatePreview = () => {
    const current = preparedCandidateRef.current;
    if (!current) return;
    const freshPreviewFile = new File([current.blob], current.fileName, { type: "application/pdf", lastModified: Date.now() });
    publishCandidate({ ...current, file: freshPreviewFile });
    setCandidatePreviewReady(false);
    setCandidatePreviewError(null);
  };

  const compileWordEdits = (request: WordEditRequest, revision: number) => {
    prepareWordExport(request, revision);
  };

  const renderPageVisual = useCallback(
    (index: number, visual: EditorVisualContext) => {
      const page = layout?.pages[index];
      if (!file || !page) return null;
      return <ActiveStandalonePage file={file} page={page} visual={visual} />;
    },
    [file, layout]
  );

  if (!file) return <div className="flex h-full items-center justify-center p-8 text-muted-foreground">Select or upload a PDF first.</div>;
  const extracting = Boolean(extractJob && !["succeeded", "failed", "cancelled"].includes(extractJob.status));
  return <>
    <PdfToolHero title="Precision PDF Layout Editor" description="Edit native and scanned PDF text while preserving the source document." />
    <div className="mt-4 flex justify-end"><EditorLanguageControl value={language} onChange={changeLanguage} disabled={extracting} /></div>
    {!layout && <div className="mt-8"><JobProgressCard title="Extracting layout" job={extractJob} active={!error} description="Extracting text layers and geometry…" /></div>}
    {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded border border-red-300 bg-red-50 p-3 text-red-700"><div className="flex items-center gap-2"><AlertTriangle size={18} className="shrink-0" /><span>{error}</span></div>{!layout && <button type="button" onClick={retryExtraction} className="shrink-0 rounded bg-red-100 px-3 py-1 text-sm font-medium text-red-800 hover:bg-red-200 transition-colors">Retry extraction</button>}</div>}
    {preparedCandidate && <section aria-label="Verified compiled PDF preview" className={showCandidatePreview ? "mt-8 flex h-[75vh] min-h-0 flex-col" : "hidden"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Verified export preview</h2>
          <p className="text-sm text-muted-foreground">This is the compiled PDF. Download uses these same verified bytes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={candidatePage <= 1} onClick={() => selectCandidatePage(Math.max(1, candidatePage - 1))} className="rounded border px-3 py-1 disabled:opacity-40">Previous page</button>
          <span className="text-sm">Page {candidatePage} of {preparedCandidate.pageCount}</span>
          <button type="button" disabled={candidatePage >= preparedCandidate.pageCount} onClick={() => selectCandidatePage(Math.min(preparedCandidate.pageCount, candidatePage + 1))} className="rounded border px-3 py-1 disabled:opacity-40">Next page</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded border bg-zinc-100 p-3">
        <VerifiedCandidatePage
          key={`${getPreviewFileIdentity(preparedCandidate.file)}:${candidatePage}`}
          file={preparedCandidate.file}
          page={candidatePage}
          onReady={candidatePreviewLoaded}
          onError={candidatePreviewFailed}
        />
      </div>
      {candidatePreviewError && <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded border border-red-300 bg-red-50 p-3 text-red-700"><span>Preview rendering failed: {candidatePreviewError}. The prepared PDF has not been marked ready for download.</span><button type="button" onClick={retryCandidatePreview} className="rounded bg-red-100 px-3 py-1 text-sm font-medium">Retry preview</button></div>}
      <div className="mt-3 flex justify-between gap-3">
        <button type="button" onClick={() => setShowCandidatePreview(false)} className="rounded border px-4 py-2">Back to editing</button>
        <button type="button" disabled={!candidatePreviewReady || compiling} onClick={downloadPreparedCandidate} className="rounded bg-violet-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Download verified PDF</button>
      </div>
    </section>}
    {layout && <div className={showCandidatePreview ? "hidden" : "mt-8 flex h-[75vh] min-h-0 flex-col"}>
      <SharedEditor
        baseline={layout}
        renderPageVisual={renderPageVisual}
        onCompile={compile}
        wordEditMode={useOcrV2 ? "operations" : "layout"}
        wordEditSourceTracker={sourceTracker}
        onCompileWordEdits={compileWordEdits}
        compiling={compiling}
        compileLabel={useOcrV2 ? "Prepare export" : "Export edited PDF"}
        onDirtyChange={setDirty}
        onRevisionChange={onEditorRevisionChange}
      />
    </div>}
  </>;
}
