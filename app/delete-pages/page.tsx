"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { getErrorMessage } from "@/lib/errorHandler";

import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PageSelector from "@/components/pdf/PageSelector";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfUploader from "@/components/pdf/PdfUploader";

export default function DeletePagesPage() {
    const [file, setFile] = useState<File | null>(null);
    const [numPages, setNumPages] = useState(0);
    const [selectedPages, setSelectedPages] = useState<number[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const uploadedFile = acceptedFiles[0];

        if (uploadedFile.size > 50 * 1024 * 1024) {
            alert("PDF exceeds 50MB limit.");
            return;
        }

        setFile(uploadedFile);
        setSelectedPages([]);
        setNumPages(0);

        try {
            const bytes = await uploadedFile.arrayBuffer();
            const pdf = await PDFDocument.load(bytes);

            setNumPages(pdf.getPageCount());
        } catch (error) {
            console.error(error);
            alert(
                `Failed to read PDF.\n\n${getErrorMessage(error)}`
            );
        }
    };

    const togglePage = (pageNumber: number) => {
        setSelectedPages((prev) =>
            prev.includes(pageNumber)
                ? prev.filter((p) => p !== pageNumber)
                : [...prev, pageNumber]
        );
    };

    const deletePages = async () => {
        if (!file) {
            alert("Please upload a PDF.");
            return;
        }

        if (selectedPages.length === 0) {
            alert("Please select at least one page to delete.");
            return;
        }

        try {
            setIsDeleting(true);

            const bytes = await file.arrayBuffer();

            const sourcePdf =
                await PDFDocument.load(bytes);

            const totalPages =
                sourcePdf.getPageCount();

            const pagesToDelete =
                new Set(selectedPages);

            const pagesToKeep =
                Array.from(
                    { length: totalPages },
                    (_, i) => i
                ).filter(
                    (pageIndex) =>
                        !pagesToDelete.has(
                            pageIndex + 1
                        )
                );

            if (pagesToKeep.length === 0) {
                alert(
                    "Cannot delete all pages from the PDF."
                );
                return;
            }

            const newPdf =
                await PDFDocument.create();

            const copiedPages =
                await newPdf.copyPages(
                    sourcePdf,
                    pagesToKeep
                );

            copiedPages.forEach((page) => {
                newPdf.addPage(page);
            });

            const pdfBytes =
                await newPdf.save();

            const blob = new Blob(
                [pdfBytes],
                {
                    type: "application/pdf",
                }
            );

            const url =
                URL.createObjectURL(blob);

            const link =
                document.createElement("a");

            link.href = url;
            link.download =
                "pages-deleted.pdf";

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);

            alert(
                `Failed to delete pages.\n\n${getErrorMessage(error)}`
            );
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Delete Pages"
                description="Remove selected pages from a PDF."
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
                    onFilesAccepted={onDrop}
                    title="Upload PDF"
                    description="Select a PDF and choose pages to remove"
                />

                {file && (
                    <div className="mt-8">
                        <PdfFileInfo file={file} />

                        <PageSelector
                            numPages={numPages}
                            selectedPages={selectedPages}
                            onTogglePage={togglePage}
                            onSelectAll={() =>
                                setSelectedPages(
                                    Array.from(
                                        { length: numPages },
                                        (_, i) => i + 1
                                    )
                                )
                            }
                            onClear={() =>
                                setSelectedPages([])
                            }
                        />

                        <PdfActionButton
                            text={`Delete ${selectedPages.length} Page${
                                selectedPages.length === 1
                                    ? ""
                                    : "s"
                            }`}
                            loadingText="Deleting Pages..."
                            loading={isDeleting}
                            onClick={deletePages}
                        />
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}