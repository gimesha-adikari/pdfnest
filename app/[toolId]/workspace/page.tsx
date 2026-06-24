"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSharedTool } from "../layout";
import PageNumbersWorkspace from "@/components/tools/PageNumbersWorkspace";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
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

export default function SharedWorkspacePage() {
    const router = useRouter();
    const { toolId, file, isLoadingConfig } = useSharedTool();

    useEffect(() => {
        if (!isLoadingConfig && !file) {
            router.replace(`/${toolId}`);
        }
    }, [file, toolId, router, isLoadingConfig]);

    if (isLoadingConfig) {
        return (
            <PdfToolLayout>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                </div>
            </PdfToolLayout>
        );
    }

    if (!file) return null;

    return (
        <PdfToolLayout>
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
        </PdfToolLayout>
    );
}