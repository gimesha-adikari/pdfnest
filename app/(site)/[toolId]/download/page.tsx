"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft, Download, ArrowRight, Sparkles } from "lucide-react";

import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { useWorkflow } from "@/context/WorkflowContext";
import { useTools } from "@/context/ToolContext";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import { getSuggestedNextTools } from "@/lib/toolSuggestions";
import RepositoryAnalyzerDownload from "@/components/repo-tool/RepositoryAnalyzerDownload";

export default function SharedDownloadPage() {
    const router = useRouter();
    const { toolId, downloadData, setFile, setDownloadData } = useSharedTool();
    const { setPendingTransfer, clearTransfer } = useWorkflow();
    const { displayTools } = useTools();

    const leavingForNextToolRef = useRef(false);
    const suggestedTools = useMemo(
        () => getSuggestedNextTools(`/${toolId}`, 3, displayTools),
        [toolId, displayTools]
    );


    useEffect(() => {
        if (leavingForNextToolRef.current) return;
        if (toolId === "repository-analyzer") return;

        if (!downloadData) {
            router.replace(`/${toolId}`);
        }
    }, [downloadData, router, toolId]);

    if (toolId === "repository-analyzer") {
        return <RepositoryAnalyzerDownload />;
    }

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
        leavingForNextToolRef.current = false;
        clearTransfer();
        setFile(null);
        setDownloadData(null);
        router.push(`/${toolId}`);
    };

    const continueWithTool = (nextHref: string) => {
        leavingForNextToolRef.current = true;

        setPendingTransfer({
            blob: downloadData.blob,
            fileName: downloadData.fileName,
            mimeType: downloadData.blob.type || "application/pdf",
            sourceToolHref: `/${toolId}`,
            targetToolHref: nextHref,
        });

        setFile(null);
        setDownloadData(null);

        router.push(nextHref);
    };

    return (
        <PdfToolLayout>
            <div className="mx-auto max-w-4xl px-4 py-16">
                <div className="text-center">
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                        <ShieldCheck size={36} />
                    </div>

                    <h2 className="mt-6 text-2xl font-bold text-[color:var(--foreground)]">
                        Task completed successfully!
                    </h2>

                    <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                        Your document is ready. Download it now or send it straight into the next tool.
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

                {suggestedTools.length > 0 && (
                    <section className="mt-14 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Sparkles size={18} className="text-indigo-500" />
                            <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                                Continue with the next step
                            </h3>
                        </div>

                        <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                            Open one of these tools and your current file will load automatically.
                        </p>

                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            {suggestedTools.map((tool) => (
                                <div
                                    key={tool.href}
                                    className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-5 shadow-sm"
                                >
                                    <h4 className="text-base font-bold text-[color:var(--foreground)]">
                                        {tool.title}
                                    </h4>
                                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                                        {tool.description}
                                    </p>

                                    <button
                                        onClick={() => continueWithTool(tool.href)}
                                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105"
                                    >
                                        Open tool
                                        <ArrowRight size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </PdfToolLayout>
    );
}