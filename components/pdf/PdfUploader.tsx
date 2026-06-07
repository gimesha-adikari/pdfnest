"use client";

import { useDropzone } from "react-dropzone";

interface PdfUploaderProps {
    onFilesAccepted: (files: File[]) => void;
    multiple?: boolean;
    accept?: Record<string, string[]>;
    title?: string;
    description?: string;
}

export default function PdfUploader({
                                        onFilesAccepted,
                                        multiple = false,
                                        accept = {
                                            "application/pdf": [".pdf"],
                                        },
                                        title = "Upload PDF",
                                        description = "Drag & drop files here or click to browse",
                                    }: PdfUploaderProps) {
    const {
        getRootProps,
        getInputProps,
        isDragActive,
    } = useDropzone({
        accept,
        multiple,
        onDrop: onFilesAccepted,
    });

    return (
        <div
            {...getRootProps()}
            className={`
                flex
                min-h-[240px]
                cursor-pointer
                flex-col
                items-center
                justify-center
                rounded-2xl
                border-2
                border-dashed
                transition-all
                duration-300

                ${
                isDragActive
                    ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
                    : "border-[color:var(--border)] hover:border-indigo-500 hover:bg-indigo-500/5"
            }
            `}
        >
            <input {...getInputProps()} />

            <div
                className="
                    flex
                    h-16
                    w-16
                    items-center
                    justify-center
                    rounded-2xl
                    bg-gradient-to-r
                    from-indigo-500
                    to-purple-600
                    text-2xl
                    text-white
                    shadow-lg
                "
            >
                📄
            </div>

            <h2 className="mt-5 text-2xl font-bold">
                {isDragActive
                    ? "Drop files here"
                    : title}
            </h2>

            <p className="mt-2 text-center text-sm text-[color:var(--muted)]">
                {description}
            </p>
        </div>
    );
}