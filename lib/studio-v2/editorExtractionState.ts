export const editorExtractionStartError = "Unable to start editor extraction. Please try again.";
export const editorCompileError = "Unable to compile the edited PDF. Please try again.";

export type EditorExtractionView = "extracting" | "failure" | "waiting" | "ready";

export function editorExtractionSubmissionFailure() {
  return { busy: false, error: editorExtractionStartError, job: null };
}

export function editorExtractionView({ busy, hasJob, hasState, error }: {
  busy: boolean;
  hasJob: boolean;
  hasState: boolean;
  error: string | null;
}): EditorExtractionView {
  if (hasState) return "ready";
  if (error) return "failure";
  if (busy && !hasJob) return "extracting";
  return "waiting";
}

export function shouldPollEditorExtraction(job: { status: string } | null, hasState: boolean): boolean {
  return Boolean(job && !hasState && !["succeeded", "failed", "cancelled"].includes(job.status));
}
