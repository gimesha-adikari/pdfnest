"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import JobProgressCard from "@/components/studio/ui/JobProgressCard";
import { SharedEditor } from "@/components/editor-v2/SharedEditor";
import { DEFAULT_EDITOR_LANGUAGE, EditorLanguageChoice, EditorLayout, EditorPage } from "@/components/editor-v2/model";
import { EditorLanguageControl } from "@/components/editor-v2/EditorLanguageControl";
import { downloadEditorJob, EditorJobRecord, submitEditorCompile, submitEditorExtract, waitForEditorJob } from "@/lib/editorJobs";
import { notify } from "@/lib/notify";
import { handleClientError } from "@/lib/errorHandler";
import { usePreviews } from "@/lib/preview/usePreviews";

function ActiveStandalonePage({ file, page }: { file: File; page: EditorPage }) {
  const requests = useMemo(() => [{ file, page: page.page_num, scale: 2, renderer: "server" as const, enabled: true }], [file, page.page_num]);
  const result = usePreviews(requests)[0];
  return result?.src ? <img src={result.src} alt={`Page ${page.page_num}`} className="h-full w-full object-fill" draggable={false}/> : <div className="flex h-full items-center justify-center bg-zinc-100"><Loader2 className="animate-spin text-indigo-500"/></div>;
}

export default function EditPdfWorkspace() {
  const { requireAuth } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const useOcrV2 = searchParams.get("ocr_v2") === "1";
  const { file: sharedFile, setDownloadData, toolId } = useSharedTool();
  const file = sharedFile as File | null;
  const [language, setLanguage] = useState<EditorLanguageChoice>(DEFAULT_EDITOR_LANGUAGE);
  const [layout, setLayout] = useState<EditorLayout | null>(null);
  const [extractJob, setExtractJob] = useState<EditorJobRecord | null>(null);
  const [sourceTracker, setSourceTracker] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
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
  }, [file, language, useOcrV2]);

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

  if (!file) return <div className="flex h-full items-center justify-center p-8 text-muted-foreground">Select or upload a PDF first.</div>;
  const extracting = Boolean(extractJob && !["succeeded", "failed", "cancelled"].includes(extractJob.status));
  return <><PdfToolHero title="Precision PDF Layout Editor" description="Edit native and scanned PDF text while preserving the source document."/><div className="mt-4 flex justify-end"><EditorLanguageControl value={language} onChange={changeLanguage} disabled={extracting}/></div>{!layout && <div className="mt-8"><JobProgressCard title="Extracting layout" job={extractJob} active={!error} description="Extracting text layers and geometry…"/></div>}{error && <div role="alert" className="mt-4 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-red-700"><AlertTriangle size={18}/>{error}</div>}{layout && <div className="mt-8 flex h-[75vh] min-h-0 flex-col"><SharedEditor baseline={layout} renderPageVisual={(index) => <ActiveStandalonePage file={file} page={layout.pages[index]}/>} onCompile={compile} compiling={compiling} compileLabel="Export edited PDF" onDirtyChange={setDirty}/></div>}</>;
}
