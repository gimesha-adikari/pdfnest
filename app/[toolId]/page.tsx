"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSharedTool } from "./layout";
import { Globe } from "lucide-react";
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
        e.preventDefault(); // Fixed the missing 'e.' context call execution identifier error here
        if (!urlInput.trim()) return;

        const virtualFile = new File([], "url_placeholder.pdf", { type: "application/pdf" }) as ExtendedFile;
        virtualFile.targetUrl = urlInput.trim();

        setFile(virtualFile);
        router.push(`/${toolId}/workspace`);
    };

    if (isLoadingConfig) {
        return (
            <PdfToolLayout>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
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
                        className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg max-w-2xl mx-auto space-y-4 animate-in fade-in duration-200"
                    >
                        <div className="space-y-2 text-center mb-4">
                            <h3 className="text-md font-bold text-[color:var(--foreground)]">Convert Remote Link Coordinates</h3>
                            <p className="text-xs text-[color:var(--muted)]">Provide an address endpoint below to parse content trees straight into a document layout canvas</p>
                        </div>

                        <div className="relative flex items-center">
                            <Globe className="absolute left-4 text-[color:var(--muted)]" size={18} />
                            <input
                                type="url"
                                required
                                placeholder="https://example.com"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-2xl focus:border-indigo-500 focus:outline-none font-medium text-[color:var(--foreground)] transition-colors"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!urlInput.trim()}
                            className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 transition shadow-md"
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