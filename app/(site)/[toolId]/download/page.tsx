"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft, Download } from "lucide-react";

import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";

export default function SharedDownloadPage() {
    const router = useRouter();
    const { toolId, downloadData, setFile, setDownloadData } = useSharedTool();

    useEffect(() => {
        if (!downloadData) {
            router.replace(`/${toolId}`);
        }
    }, [downloadData, toolId, router]);

    if (!downloadData) return null;

    const triggerDownload = () => {
        const downloadUrl = window.URL.createObjectURL(downloadData.blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = downloadData.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    };

    const startOver = () => {
        setFile(null);
        setDownloadData(null);
        router.push(`/${toolId}`);
    };

    return (
        <PdfToolLayout>
            <div className="mx-auto max-w-2xl px-4 py-16 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <ShieldCheck size={36} />
                </div>

                <h2 className="mt-6 text-2xl font-bold text-[color:var(--foreground)]">
                    Task completed successfully!
                </h2>

                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                    Your document is ready. Click below to save your file.
                </p>

                <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <button
                        onClick={triggerDownload}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-8 py-4 font-semibold text-white transition hover:brightness-105 shadow-md sm:w-auto"
                    >
                        <Download size={18} />
                        Download File
                    </button>

                    <button
                        onClick={startOver}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-6 py-4 font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--background)] sm:w-auto"
                    >
                        <ArrowLeft size={18} />
                        Process Another
                    </button>
                </div>
            </div>
        </PdfToolLayout>
    );
}