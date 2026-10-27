// Studio PDF inputs only. Backend admission remains authoritative.
export const MAX_STUDIO_PDF_SOURCE_BYTES = 50 * 1024 * 1024;
export const STUDIO_PDF_SOURCE_LIMIT_MESSAGE = "Studio supports PDF source files up to 50 MiB. Choose a smaller PDF.";

export function studioPdfSourceIssue(file: Pick<File, "size">) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return { status: 400, code: "STUDIO_SOURCE_INVALID", message: "Choose a non-empty PDF source file for Studio." };
  }
  if (file.size > MAX_STUDIO_PDF_SOURCE_BYTES) {
    return { status: 413, code: "STUDIO_SOURCE_TOO_LARGE", message: STUDIO_PDF_SOURCE_LIMIT_MESSAGE };
  }
  return null;
}

export function validateStudioPdfSourceFile(file: File): string | null {
  return studioPdfSourceIssue(file)?.message ?? null;
}

// Deliberately use fixed public copy rather than provider/Worker error details.
export function studioSourceErrorMessage(code: string | undefined): string | undefined {
  switch (code) {
    case "STUDIO_SOURCE_TOO_LARGE": return STUDIO_PDF_SOURCE_LIMIT_MESSAGE;
    case "STUDIO_SOURCE_INVALID": return "Studio could not read this PDF. Choose a valid PDF source file.";
    case "STUDIO_SOURCE_ENCRYPTED": return "Unlock this password-protected PDF before opening it in Studio.";
    case "STUDIO_SOURCE_PAGE_LIMIT": return "This PDF exceeds Studio's supported page limit. Choose a PDF with fewer pages.";
    case "STUDIO_SOURCE_NOT_FOUND": return "Studio could not find the uploaded PDF. Upload it again.";
    case "STUDIO_SOURCE_CHANGED": return "The PDF source changed while Studio was checking it. Upload it again.";
    case "STUDIO_SOURCE_UNAVAILABLE": return "Studio source admission is temporarily unavailable. Your file may already have been uploaded. Try again.";
    case "PREVIEW_SOURCE_TOO_LARGE": return "This PDF is too large for the current preview processing limit.";
    default: return undefined;
  }
}
