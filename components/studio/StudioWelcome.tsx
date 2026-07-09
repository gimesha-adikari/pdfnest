"use client";

import React from "react";
import PdfUploader from "@/components/pdf/PdfUploader";

interface StudioWelcomeProps {
    onFilesAccepted: (files: File[]) => Promise<void>;
    errorMessage: string | null;
}

export default function StudioWelcome({
                                          onFilesAccepted,
                                          errorMessage,
                                      }: StudioWelcomeProps) {
    return (
        <div className="w-full rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <PdfUploader
                onFilesAccepted={onFilesAccepted}
                title="Upload a PDF to start the Studio"
                description="This Studio handles upload and preview as the base editing shell."
                accept=".pdf"
                multiple={false}
            />

            {errorMessage && (
                <p className="mt-4 text-sm text-red-500">
                    {errorMessage}
                </p>
            )}
        </div>
    );
}