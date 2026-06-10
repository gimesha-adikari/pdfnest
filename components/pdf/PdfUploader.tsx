"use client";

import React, { useCallback } from "react";
import { useDropzone, Accept } from "react-dropzone";
import { UploadCloud } from "lucide-react";

interface PdfUploaderProps {
    onFilesAccepted: (files: File[]) => void;
    title?: string;
    description?: string;
    accept?: Accept;
    multiple?: boolean;
}

export default function PdfUploader({
                                        onFilesAccepted,
                                        title = "Select or Drop Files Here",
                                        description = "Supports standard documents configuration formats",
                                        accept = { "application/pdf": [".pdf"] },
                                        multiple = false
                                    }: PdfUploaderProps) {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            onFilesAccepted(acceptedFiles);
        }
    }, [onFilesAccepted]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept,
        multiple
    });

    return (
        <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all outline-none ${
                isDragActive
                    ? "border-indigo-500 bg-indigo-500/5"
                    : "border-[color:var(--border)] bg-[var(--background)]/30 hover:border-[color:var(--muted)]"
            }`}
        >
            <input {...getInputProps()} />
            <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500 mb-4">
                <UploadCloud size={28} />
            </div>
            <p className="text-sm font-semibold text-[color:var(--foreground)] text-center mb-1">
                {title}
            </p>
            <p className="text-xs text-[color:var(--muted)] text-center">
                {description}
            </p>
        </div>
    );
}