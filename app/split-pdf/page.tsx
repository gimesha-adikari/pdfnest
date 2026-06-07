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

export default function SplitPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [numPages, setNumPages] = useState(0);
    const [selectedPages, setSelectedPages] = useState<number[]>([]);
    const [isSplitting, setIsSplitting] = useState(false);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const uploadedFile = acceptedFiles[0];

        if (
            uploadedFile.size >
            50 * 1024 * 1024
        ) {
            alert(
                "PDF exceeds 50MB limit."
            );
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
            alert(`Failed to read PDF.\n\n${getErrorMessage(error)}`)
        }
    };

    const togglePage = (pageNumber: number) => {
        setSelectedPages((prev) =>
            prev.includes(pageNumber)
                ? prev.filter((p) => p !== pageNumber)
                : [...prev, pageNumber]
        );
    };

    const splitPdf = async () => {
        if (!file) {
            alert("Please upload a PDF.");
            return;
        }

        if (selectedPages.length === 0) {
            alert("Please select at least one page.");
            return;
        }

        try {
            setIsSplitting(true);

            const bytes = await file.arrayBuffer();

            const sourcePdf = await PDFDocument.load(bytes);

            const totalPages = sourcePdf.getPageCount();

            const validPages = [...selectedPages]
                .sort((a, b) => a - b)
                .filter(
                    (page) =>
                        page >= 1 &&
                        page <= totalPages
                );

            if (validPages.length === 0) {
                alert("No valid pages selected.");
                return;
            }

            const newPdf = await PDFDocument.create();

            const copiedPages = await newPdf.copyPages(
                sourcePdf,
                validPages.map((page) => page - 1)
            );

            copiedPages.forEach((page) => {
                newPdf.addPage(page);
            });

            const pdfBytes = await newPdf.save();

            const blob = new Blob([pdfBytes], {
                type: "application/pdf",
            });

            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");

            link.href = url;
            link.download = "split.pdf";

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            alert(`Failed to split PDF.\n\n${getErrorMessage(error)}`)
        } finally {
            setIsSplitting(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Split PDF"
                description="Select pages and create a new PDF."
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
                    description="Select a PDF to split"
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
                            onClear={() => setSelectedPages([])}
                        />
                        <PdfActionButton
                            text={`Extract ${selectedPages.length} Page${
                                selectedPages.length === 1 ? "" : "s"
                            }`}
                            loadingText="Creating PDF..."
                            loading={isSplitting}
                            onClick={splitPdf}
                        />
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}