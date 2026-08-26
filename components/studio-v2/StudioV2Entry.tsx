"use client";

import React, { useCallback } from "react";
import { FileUp, Loader2 } from "lucide-react";
import PdfUploader from "@/components/pdf/PdfUploader";

interface StudioV2EntryProps {
  isCreating: boolean;
  error: string | null;
  onUpload: (file: File) => Promise<unknown>;
}

// The entry page is intentionally narrow: it collects a real PDF and hands it
// to the backend-owned Studio initializer. It never invents page metadata.
export const StudioV2Entry: React.FC<StudioV2EntryProps> = ({
  isCreating,
  error,
  onUpload,
}) => {
  const onFilesAccepted = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file && !isCreating) {
        void onUpload(file).catch(() => {
          // The hook exposes a user-facing server validation error below.
        });
      }
    },
    [isCreating, onUpload]
  );

  return (
    <main className="min-h-screen bg-[#0B0C0F] text-[#F5F7FA] flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#12141A] p-6 sm:p-9 shadow-2xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15 text-violet-200">
            <FileUp className="h-6 w-6" />
          </div>
          <p className="text-[11px] font-semibold tracking-[0.22em] text-violet-200">PLATEN</p>
          <h1 className="mt-2 text-xl font-semibold text-white">Open a PDF in Studio</h1>
          <p className="mt-2 text-sm text-[#9AA1AD]">
            Choose a PDF to create a new Studio document. Your source file and Version 0 are initialized securely by the backend.
          </p>
        </div>

        {isCreating ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-violet-400/30 bg-violet-500/5 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-violet-200" />
            <p className="mt-3 text-sm font-medium text-white">Preparing Studio document…</p>
            <p className="mt-1 text-xs text-[#9AA1AD]">Validating the PDF and building Version 0.</p>
          </div>
        ) : (
          <PdfUploader
            title="Upload or drop a PDF"
            description="PDF documents only. Studio will inspect the source before opening it."
            accept="application/pdf,.pdf"
            multiple={false}
            bypassEncryptionCheck
            onFilesAccepted={onFilesAccepted}
          />
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
            {error}
          </p>
        )}
      </section>
    </main>
  );
};
