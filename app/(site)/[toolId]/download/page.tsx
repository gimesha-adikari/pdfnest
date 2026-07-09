"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft, Download } from "lucide-react";
import { useSharedTool } from "../layout";
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

                {/*<div className="mb-8 min-h-22.5 w-full rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-xs text-gray-400">*/}
                {/*    [Top Ad Container]*/}
                {/*</div>*/}

                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <ShieldCheck size={36} />
                </div>

                <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-zinc-100">
                    Task completed successfully!
                </h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                    Your document is ready. Click below to save your file.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button
                        onClick={triggerDownload}
                        className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-4 font-semibold text-white transition hover:bg-blue-700 shadow-md"
                    >
                        <Download size={18} />
                        Download File
                    </button>

                    <button
                        onClick={startOver}
                        className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-4 font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <ArrowLeft size={18} />
                        Process Another
                    </button>
                </div>

                {/*<div className="mt-12 min-h-62.5 w-full rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-xs text-gray-400">*/}
                {/*    [High-Value Ad Banner Display]*/}
                {/*</div>*/}
            </div>
        </PdfToolLayout>
    );
}