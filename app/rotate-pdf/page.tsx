"use client";

import { useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { getErrorMessage } from "@/lib/errorHandler";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PageSelector from "@/components/pdf/PageSelector";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfUploader from "@/components/pdf/PdfUploader";

export default function RotatePdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [numPages, setNumPages] = useState(0);
    const [selectedPages, setSelectedPages] = useState<number[]>([]);
    const [rotation, setRotation] = useState<90 | -90>(90);
    const [isRotating, setIsRotating] = useState(false);

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

    const rotatePdf = async () => {
        if (!file) {
            alert("Please upload a PDF.");
            return;
        }

        if (selectedPages.length === 0) {
            alert("Please select at least one page.");
            return;
        }

        try {
            setIsRotating(true);

            const bytes = await file.arrayBuffer();

            const pdf = await PDFDocument.load(bytes);

            selectedPages.forEach((pageNumber) => {
                const page = pdf.getPage(pageNumber - 1);

                const current =
                    page.getRotation().angle;

                page.setRotation(
                    degrees(current + rotation)
                );
            });

            const pdfBytes = await pdf.save();

            const blob = new Blob(
                [pdfBytes],
                {
                    type: "application/pdf",
                }
            );

            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");

            link.href = url;
            link.download = "rotated.pdf";

            document.body.appendChild(link);

            link.click();

            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            alert(`Failed to rotate PDF.\n\n${getErrorMessage(error)}`)
        } finally {
            setIsRotating(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Rotate PDF"
                description="Rotate selected PDF pages left or right."
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
                    description="Select a PDF to rotate"
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
                            text={`Rotate ${selectedPages.length} Page${
                                selectedPages.length === 1 ? "" : "s"
                            }`}
                            loadingText="Rotating PDF..."
                            loading={isRotating}
                            onClick={rotatePdf}
                        />
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}