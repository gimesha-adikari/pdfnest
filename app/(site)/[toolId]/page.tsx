"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFeatures from "@/components/pdf/PdfFeatures";

interface ExtendedFile extends File {
    initialBatch?: File[];
    targetUrl?: string;
}

export default function SharedUploadPage() {
    const { toolId, toolConfig, setFile, isLoadingConfig } = useSharedTool();
    const router = useRouter();
    const [urlInput, setUrlInput] = useState("");

    const handleFilesAccepted = (files: File[]) => {
        if (files && files.length > 0) {
            const baselineFile = files[0] as ExtendedFile;

            if (toolConfig.multiple) {
                baselineFile.initialBatch = files;
            }

            setFile(baselineFile);
            router.push(`/${toolId}/workspace`);
        }
    };

    const handleUrlSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!urlInput.trim()) return;

        const virtualFile = new File([], "url_placeholder.pdf", {
            type: "application/pdf",
        }) as ExtendedFile;

        virtualFile.targetUrl = urlInput.trim();

        setFile(virtualFile);
        router.push(`/${toolId}/workspace`);
    };

    if (isLoadingConfig) {
        return (
            <PdfToolLayout>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
                </div>
            </PdfToolLayout>
        );
    }

    return (
        <PdfToolLayout>
            <PdfToolHero
                title={toolConfig.name}
                description={toolConfig.description}
                icon={toolConfig.icon}
            />

            <div className="mx-auto max-w-5xl px-4 py-8">
                {toolId === "url-to-pdf" ? (
                    <form
                        onSubmit={handleUrlSubmit}
                        className="mx-auto max-w-2xl space-y-4 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg"
                    >
                        <div className="mb-4 space-y-2 text-center">
                            <h3 className="text-md font-bold text-[color:var(--foreground)]">
                                Convert Remote Link Coordinates
                            </h3>
                            <p className="text-xs text-[color:var(--muted-foreground)]">
                                Provide an address endpoint below to parse content trees straight into a document layout canvas
                            </p>
                        </div>

                        <div className="relative flex items-center">
                            <Globe className="absolute left-4 text-[color:var(--muted-foreground)]" size={18} />
                            <input
                                type="url"
                                required
                                placeholder="https://example.com"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] py-3.5 pl-12 pr-4 text-sm font-medium text-[color:var(--foreground)] transition-colors focus:border-[var(--primary)] focus:outline-none"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!urlInput.trim()}
                            className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50"
                        >
                            Open Webpage Capture Workspace
                        </button>
                    </form>
                ) : (
                    <PdfUploader
                        onFilesAccepted={handleFilesAccepted}
                        accept={toolConfig.accept || ".pdf"}
                        multiple={!!toolConfig.multiple}
                        bypassEncryptionCheck={toolId === "unlock-pdf"}
                    />
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}