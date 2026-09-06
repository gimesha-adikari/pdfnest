"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { type EditPdfEditorEngine, resolveEditPdfEditorEngine } from "@/lib/editPdfEngine";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import JobProgressCard from "@/components/studio/ui/JobProgressCard";
import { EditorVisualContext, SharedEditor } from "@/components/editor-v2/SharedEditor";
import { DEFAULT_EDITOR_LANGUAGE, EditorLanguageChoice, EditorLayout, EditorPage } from "@/components/editor-v2/model";
import { studioVisualResolution } from "@/components/editor-v2/visualResolution";
import { EditorLanguageControl } from "@/components/editor-v2/EditorLanguageControl";
import { downloadEditorJob, EditorJobRecord, submitEditorCompile, submitEditorExtract, waitForEditorJob } from "@/lib/editorJobs";
import { notify } from "@/lib/notify";
import { handleClientError } from "@/lib/errorHandler";
import { usePreviews } from "@/lib/preview/usePreviews";

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
  const [language, setLanguage] = useState<EditorLanguageChoice>(DEFAULT_EDITOR_LANGUAGE);
  const [layout, setLayout] = useState<EditorLayout | null>(null);
  const [extractJob, setExtractJob] = useState<EditorJobRecord | null>(null);
  const [sourceTracker, setSourceTracker] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryExtraction = () => {
    setError(null);
    setExtractJob(null);
    setRetryCount((c) => c + 1);
  };
  const changeLanguage = (next: EditorLanguageChoice) => {
    if (!dirty || window.confirm("Discard unsaved edits and extract again with this language?")) { setDirty(false); setLanguage(next); }
  };

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLayout(null); setError(null); setExtractJob(null);
      try {
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
  }, [file, language, useOcrV2, retryCount]);

  const compile = (draft: EditorLayout) => void requireAuth(async () => {
    if (!file) return;
    setCompiling(true); setError(null);
    try {
      const submitted = await submitEditorCompile({ ...draft, source_tracker: sourceTracker });
      const job = await waitForEditorJob(submitted.job_id);
      if (job.status !== "succeeded") throw new Error(job.error || "Compilation failed");
      const blob = await downloadEditorJob(job.id);
      setDownloadData({ blob, fileName: `edited_${file.name}` });
      notify("PDF compiled successfully!", "success");
      router.replace(`/${toolId || "edit-pdf"}/download`);
    } catch (err) {
      const message = String(err).toLowerCase();
      if (message.includes("source_not_found") || message.includes("nosuchkey") || message.includes("does not exist")) { notify("This editing session has expired. Please upload the PDF again.", "error"); router.replace(`/${toolId || "edit-pdf"}`); }
      else { setError("Compilation failed."); handleClientError(err); }
    } finally { setCompiling(false); }
  });

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
  return <><PdfToolHero title="Precision PDF Layout Editor" description="Edit native and scanned PDF text while preserving the source document."/><div className="mt-4 flex justify-end"><EditorLanguageControl value={language} onChange={changeLanguage} disabled={extracting}/></div>{!layout && <div className="mt-8"><JobProgressCard title="Extracting layout" job={extractJob} active={!error} description="Extracting text layers and geometry…"/></div>}{error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded border border-red-300 bg-red-50 p-3 text-red-700"><div className="flex items-center gap-2"><AlertTriangle size={18} className="shrink-0"/><span>{error}</span></div><button type="button" onClick={retryExtraction} className="shrink-0 rounded bg-red-100 px-3 py-1 text-sm font-medium text-red-800 hover:bg-red-200 transition-colors">Retry</button></div>}{layout && <div className="mt-8 flex h-[75vh] min-h-0 flex-col"><SharedEditor baseline={layout} renderPageVisual={renderPageVisual} onCompile={compile} compiling={compiling} compileLabel="Export edited PDF" onDirtyChange={setDirty}/></div>}</>;
}
