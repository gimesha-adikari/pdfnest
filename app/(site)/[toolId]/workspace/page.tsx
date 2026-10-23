"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { useBackendOnlyToolAvailability } from "@/components/pdf/BackendOnlyToolGuard";
import BackendUnavailableNotice from "@/components/pdf/BackendUnavailableNotice";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";

import PageNumbersWorkspace from "@/components/tools/PageNumbersWorkspace";
import CodeToPdfWorkspace from "@/components/tools/CodeToPdfWorkspace";
import CompressPdfWorkspace from "@/components/tools/CompressPdfWorkspace";
import DeletePagesWorkspace from "@/components/tools/DeletePagesWorkspace";
import EditMetadataWorkspace from "@/components/tools/EditMetadataWorkspace";
import EditPdfWorkspace from "@/components/tools/EditPdfWorkspace";
import ExcelToPdfWorkspace from "@/components/tools/ExcelToPdfWorkspace";
import GrayscalePdfWorkspace from "@/components/tools/GrayscalePdfWorkspace";
import ImageToTextPdfWorkspace from "@/components/tools/ImageToTextPdfWorkspace";
import ImagesToPdfWorkspace from "@/components/tools/ImagesToPdfWorkspace";
import LockPdfWorkspace from "@/components/tools/LockPdfWorkspace";
import MarkdownToPdfWorkspace from "@/components/tools/MarkdownToPdfWorkspace";
import MergePdfWorkspace from "@/components/tools/MergePdfWorkspace";
import PdfToExcelWorkspace from "@/components/tools/PdfToExcelWorkspace";
import PdfToImagesWorkspace from "@/components/tools/PdfToImagesWorkspace";
import PdfToPowerPointWorkspace from "@/components/tools/PdfToPowerPointWorkspace";
import PdfToTextWorkspace from "@/components/tools/PdfToTextWorkspace";
import PdfToMarkdownWorkspace from "@/components/tools/PdfToMarkdownWorkspace";
import PdfToWordWorkspace from "@/components/tools/PdfToWordWorkspace";
import PowerPointToPdfWorkspace from "@/components/tools/PowerPointToPdfWorkspace";
import RedactPdfWorkspace from "@/components/tools/RedactPdfWorkspace";
import ReorderPagesWorkspace from "@/components/tools/ReorderPagesWorkspace";
import RepairPdfWorkspace from "@/components/tools/RepairPdfWorkspace";
import RotatePdfWorkspace from "@/components/tools/RotatePdfWorkspace";
import SignPdfWorkspace from "@/components/tools/SignPdfWorkspace";
import SplitPdfWorkspace from "@/components/tools/SplitPdfWorkspace";
import UnlockPdfWorkspace from "@/components/tools/UnlockPdfWorkspace";
import UrlToPdfWorkspace from "@/components/tools/UrlToPdfWorkspace";
import WatermarkPdfWorkspace from "@/components/tools/WatermarkPdfWorkspace";
import WordToPdfWorkspace from "@/components/tools/WordToPdfWorkspace";
import CropPdfWorkspace from "@/components/tools/CropPdfWorkspace";
import DuplicatePagesWorkspace from "@/components/tools/DuplicatePagesWorkspace";
import InsertBlankWorkspace from "@/components/tools/InsertBlankWorkspace";
import AddTextWorkspace from "@/components/tools/AddTextWorkspace";
import HighlightPdfWorkspace from "@/components/tools/HighlightPdfWorkspace";
import UnderlinePdfWorkspace from "@/components/tools/UnderlinePdfWorkspace";
import StrikeoutPdfWorkspace from "@/components/tools/StrikeoutPdfWorkspace";
import RepositoryAnalyzerWorkspace from "@/components/tools/RepositoryAnalyzerWorkspace";
import OcrTextV2Workspace from "@/components/tools/OcrTextV2Workspace";
import SearchablePdfV2Workspace from "@/components/tools/SearchablePdfV2Workspace";
import StructuredDocumentV2Workspace from "@/components/tools/StructuredDocumentV2Workspace";
import OcrAwareMarkupV2Workspace from "@/components/tools/OcrAwareMarkupV2Workspace";
import { isOcrV2DevelopmentToolId } from "@/lib/ocrV2DevelopmentTools";
import { getProtectedPdfRoutePolicy } from "@/lib/security/protectedPdfRoutePolicy";
import {
    authorizeCloudProcessing,
    hasCloudSubmissionInitiated,
    isCloudProcessingAuthorized,
    requiresCloudProcessingAuthorization,
} from "@/lib/security/pdfInputPreparation";

export default function SharedWorkspacePage() {
    const router = useRouter();
    const { toolId, toolConfig, file, setFile, isLoadingConfig } = useSharedTool();
    const { isExecutable } = useBackendOnlyToolAvailability();
    const [authorizedFile, setAuthorizedFile] = useState<File | null>(null);
    const protectedPdfPolicy = getProtectedPdfRoutePolicy(toolId);

    useEffect(() => {
        if (!isLoadingConfig && !file && !isOcrV2DevelopmentToolId(toolId)) {
            router.replace(`/${toolId}`);
        }
    }, [file, toolId, router, isLoadingConfig]);

    if (isLoadingConfig) {
        return (
            <PdfToolLayout>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
                </div>
            </PdfToolLayout>
        );
    }

    if (!file && !isOcrV2DevelopmentToolId(toolId)) return null;

    if (!isExecutable) {
        return (
            <PdfToolLayout>
                <div className="mx-auto max-w-5xl px-4 py-8">
                    <BackendUnavailableNotice toolName={toolConfig.name} />
                </div>
            </PdfToolLayout>
        );
    }

    const inputRequiresAuthorization = file && requiresCloudProcessingAuthorization(file);
    const hasScopedAuthorization = file && (
        authorizedFile === file || isCloudProcessingAuthorized(file, toolId)
    );

    if (
        file &&
        protectedPdfPolicy === "unqualified" &&
        inputRequiresAuthorization
    ) {
        return (
            <PdfToolLayout>
                <section role="dialog" aria-labelledby="protected-route-block-title" className="mx-auto mt-12 max-w-xl rounded-2xl border border-rose-500/40 bg-rose-500/5 p-6 text-center">
                    <h2 id="protected-route-block-title" className="text-lg font-semibold text-[color:var(--foreground)]">Protected input is not supported by this route</h2>
                    <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">This route has no qualified protected-PDF execution policy. No processing request was made. Return to the upload page and choose a supported workflow.</p>
                    <button type="button" onClick={() => { setFile(null); router.replace(`/${toolId}`); }} className="mt-5 rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-semibold">Choose another workflow</button>
                </section>
            </PdfToolLayout>
        );
    }

    if (
        file &&
        (protectedPdfPolicy === "cloud-only" || protectedPdfPolicy === "cloud-consent") &&
        inputRequiresAuthorization &&
        !hasScopedAuthorization
    ) {
        return (
            <PdfToolLayout>
                <section role="dialog" aria-labelledby="cloud-processing-authorization-title" className="mx-auto mt-12 max-w-xl rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 text-center">
                    <h2 id="cloud-processing-authorization-title" className="text-lg font-semibold text-[color:var(--foreground)]">Cloud processing authorization</h2>
                    <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                        {protectedPdfPolicy === "cloud-only"
                            ? `${toolConfig.name} requires Cloud processing for protected input.`
                            : `${toolConfig.name} can send protected input to Platen Cloud for some processing modes.`}
                        {" "}This input is associated with protected or unverified source data. This approval authorizes this tool to send its current input to Platen Cloud. Cloud-unlock consent, if used, does not authorize this processing request.
                    </p>
                    {hasCloudSubmissionInitiated(file) && <p role="status" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">A Cloud request was started for this input or its protected source. File delivery may have occurred and cannot be recalled.</p>}
                    <div className="mt-5 flex justify-center gap-3">
                        <button type="button" onClick={() => { setFile(null); router.replace(`/${toolId}`); }} className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-semibold">Cancel</button>
                        <button type="button" onClick={() => { authorizeCloudProcessing(file, toolId); setAuthorizedFile(file); }} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">Authorize Cloud processing</button>
                    </div>
                </section>
            </PdfToolLayout>
        );
    }

    return (
        <PdfToolLayout>
            {file && (protectedPdfPolicy === "cloud-only" || protectedPdfPolicy === "cloud-consent") && inputRequiresAuthorization && hasScopedAuthorization && (
                <p role="status" className="mx-auto mt-5 max-w-5xl rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-[color:var(--muted-foreground)]">Cloud is required for this tool. Cloud processing was authorized for this input and route.</p>
            )}
            {toolId === "add-page-numbers" && <PageNumbersWorkspace />}
            {toolId === "code-to-pdf" && <CodeToPdfWorkspace />}
            {toolId === "compress-pdf" && <CompressPdfWorkspace />}
            {toolId === "delete-pages" && <DeletePagesWorkspace />}
            {toolId === "edit-metadata" && <EditMetadataWorkspace />}
            {toolId === "edit-pdf" && <EditPdfWorkspace />}
            {toolId === "excel-to-pdf" && <ExcelToPdfWorkspace />}
            {toolId === "grayscale-pdf" && <GrayscalePdfWorkspace />}
            {toolId === "image-to-searchable-pdf" && <ImageToTextPdfWorkspace />}
            {toolId === "images-to-pdf" && <ImagesToPdfWorkspace />}
            {toolId === "lock-pdf" && <LockPdfWorkspace />}
            {toolId === "markdown-to-pdf" && <MarkdownToPdfWorkspace />}
            {toolId === "merge-pdf" && <MergePdfWorkspace />}
            {toolId === "pdf-to-excel" && <PdfToExcelWorkspace />}
            {toolId === "pdf-to-images" && <PdfToImagesWorkspace />}
            {toolId === "pdf-to-powerpoint" && <PdfToPowerPointWorkspace />}
            {toolId === "pdf-to-text" && <PdfToTextWorkspace />}
            {toolId === "pdf-to-markdown" && <PdfToMarkdownWorkspace />}
            {toolId === "pdf-to-word" && <PdfToWordWorkspace />}
            {toolId === "powerpoint-to-pdf" && <PowerPointToPdfWorkspace />}
            {toolId === "redact-pdf" && <RedactPdfWorkspace />}
            {toolId === "reorder-pages" && <ReorderPagesWorkspace />}
            {toolId === "repair-pdf" && <RepairPdfWorkspace />}
            {toolId === "rotate-pdf" && <RotatePdfWorkspace />}
            {toolId === "sign-pdf" && <SignPdfWorkspace />}
            {toolId === "split-pdf" && <SplitPdfWorkspace />}
            {toolId === "unlock-pdf" && <UnlockPdfWorkspace />}
            {toolId === "url-to-pdf" && <UrlToPdfWorkspace />}
            {toolId === "watermark-pdf" && <WatermarkPdfWorkspace />}
            {toolId === "word-to-pdf" && <WordToPdfWorkspace />}
            {toolId === "crop-pdf" && <CropPdfWorkspace />}
            {toolId === "duplicate-pages" && <DuplicatePagesWorkspace />}
            {toolId === "insert-blank-pages" && <InsertBlankWorkspace />}
            {toolId === "add-text" && <AddTextWorkspace />}
            {toolId === "highlight-pdf" && <HighlightPdfWorkspace />}
            {toolId === "underline-pdf" && <UnderlinePdfWorkspace />}
            {toolId === "strikeout-pdf" && <StrikeoutPdfWorkspace />}
            {toolId === "repository-analyzer" && <RepositoryAnalyzerWorkspace />}
            {toolId === "ocr-text-v2" && <OcrTextV2Workspace />}
            {toolId === "searchable-pdf-v2" && <SearchablePdfV2Workspace />}
            {toolId === "document-extraction-v2" && <StructuredDocumentV2Workspace profile="DOCUMENT_EXTRACTION_V2" />}
            {toolId === "pdf-to-markdown-v2" && <StructuredDocumentV2Workspace profile="PDF_MARKDOWN_V2" />}
            {toolId === "highlight-pdf-v2" && <OcrAwareMarkupV2Workspace action="highlight" />}
            {toolId === "underline-pdf-v2" && <OcrAwareMarkupV2Workspace action="underline" />}
            {toolId === "strikeout-pdf-v2" && <OcrAwareMarkupV2Workspace action="strikeout" />}
        </PdfToolLayout>
    );
}
