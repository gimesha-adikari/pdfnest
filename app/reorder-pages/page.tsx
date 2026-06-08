"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { getErrorMessage } from "@/lib/errorHandler";

import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PageReorderGrid from "@/components/pdf/PageReorderGrid";

type PageItem = {
    id: string;
    pageNumber: number;
    thumbnail: string;
};

export default function ReorderPagesPage() {
    const [file, setFile] = useState<File | null>(null);

    const [pages, setPages] =
        useState<PageItem[]>([]);

    const [isReordering, setIsReordering] =
        useState(false);

    const onDrop = async (
        acceptedFiles: File[]
    ) => {
        const uploadedFile =
            acceptedFiles[0];

        if (!uploadedFile) return;

        if (
            uploadedFile.size >
            50 * 1024 * 1024
        ) {
            alert(
                "PDF exceeds 50MB limit."
            );
            return;
        }

        try {
            setFile(uploadedFile);
            setPages([]);

            const arrayBuffer =
                await uploadedFile.arrayBuffer();

            const pdfjsLib = await import(
                "pdfjs-dist/legacy/build/pdf.mjs"
                );

            pdfjsLib.GlobalWorkerOptions.workerSrc =
                "/pdf.worker.mjs";

            const pdf =
                await pdfjsLib
                    .getDocument({
                        data: arrayBuffer,
                    })
                    .promise;

            const generatedPages: PageItem[] =
                [];

            for (
                let pageNumber = 1;
                pageNumber <= pdf.numPages;
                pageNumber++
            ) {
                const page =
                    await pdf.getPage(
                        pageNumber
                    );

                const viewport =
                    page.getViewport({
                        scale: 0.4,
                    });

                const canvas =
                    document.createElement(
                        "canvas"
                    );

                const context =
                    canvas.getContext("2d");

                if (!context) continue;

                canvas.width =
                    viewport.width;

                canvas.height =
                    viewport.height;

                await page.render({
                    canvasContext:
                    context,
                    viewport,
                }).promise;

                generatedPages.push({
                    id: crypto.randomUUID(),
                    pageNumber,
                    thumbnail:
                        canvas.toDataURL(
                            "image/png"
                        ),
                });
            }

            setPages(generatedPages);
        } catch (error) {
            console.error(error);

            alert(
                `Failed to load PDF.\n\n${getErrorMessage(
                    error
                )}`
            );
        }
    };

    // const moveUp = (
    //     index: number
    // ) => {
    //     if (index === 0) return;
    //
    //     setPages((prev) => {
    //         const updated = [...prev];
    //
    //         [
    //             updated[index - 1],
    //             updated[index],
    //         ] = [
    //             updated[index],
    //             updated[index - 1],
    //         ];
    //
    //         return updated;
    //     });
    // };
    //
    // const moveDown = (
    //     index: number
    // ) => {
    //     if (
    //         index ===
    //         pages.length - 1
    //     )
    //         return;
    //
    //     setPages((prev) => {
    //         const updated = [...prev];
    //
    //         [
    //             updated[index + 1],
    //             updated[index],
    //         ] = [
    //             updated[index],
    //             updated[index + 1],
    //         ];
    //
    //         return updated;
    //     });
    // };

    const reorderPdf = async () => {
        if (!file) {
            alert(
                "Please upload a PDF."
            );
            return;
        }

        try {
            setIsReordering(true);

            const bytes =
                await file.arrayBuffer();

            const sourcePdf =
                await PDFDocument.load(
                    bytes
                );

            const reorderedPdf =
                await PDFDocument.create();

            const pageOrder =
                pages.map(
                    (page) =>
                        page.pageNumber
                );

            const copiedPages =
                await reorderedPdf.copyPages(
                    sourcePdf,
                    pageOrder.map(
                        (page) =>
                            page - 1
                    )
                );

            copiedPages.forEach(
                (page) =>
                    reorderedPdf.addPage(
                        page
                    )
            );

            const pdfBytes =
                await reorderedPdf.save();

            const blob =
                new Blob([pdfBytes], {
                    type: "application/pdf",
                });

            const url =
                URL.createObjectURL(
                    blob
                );

            const link =
                document.createElement(
                    "a"
                );

            link.href = url;
            link.download =
                "reordered.pdf";

            document.body.appendChild(
                link
            );

            link.click();

            document.body.removeChild(
                link
            );

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);

            alert(
                `Failed to reorder PDF.\n\n${getErrorMessage(
                    error
                )}`
            );
        } finally {
            setIsReordering(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Reorder Pages"
                description="Change the order of pages inside a PDF."
            />

            <div
                className="
                    mt-12
                    rounded-3xl
                    border
                    border-[color:var(--border)]
                    bg-[var(--card)]
                    p-8
                    shadow-lg
                "
            >
                <PdfUploader
                    onFilesAccepted={
                        onDrop
                    }
                    title="Upload PDF"
                    description="Select a PDF and rearrange its pages"
                />

                {file && (
                    <div className="mt-8">
                        <div
                            className="
                                rounded-xl
                                border
                                border-[color:var(--border)]
                                p-4
                            "
                        >
                            <p className="font-semibold">
                                {file.name}
                            </p>

                            <p className="text-sm text-[color:var(--muted)]">
                                {
                                    pages.length
                                }{" "}
                                pages
                            </p>
                        </div>

                        <PageReorderGrid
                            pages={pages}
                            setPages={setPages}
                        />

                        <PdfActionButton
                            text="Reorder PDF"
                            loadingText="Reordering..."
                            loading={
                                isReordering
                            }
                            onClick={
                                reorderPdf
                            }
                        />
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}