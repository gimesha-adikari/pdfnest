"use client";

import {useState} from "react";
import {PDFDocument} from "pdf-lib";
import { getErrorMessage } from "@/lib/errorHandler";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFileList from "@/components/pdf/PdfFileList";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfUploader from "@/components/pdf/PdfUploader";

export default function MergePdfPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [isMerging, setIsMerging] = useState(false);

    const addFiles = (newFiles: File[]) => {
        const MAX_FILE_SIZE =
            50 * 1024 * 1024;

        const validFiles =
            newFiles.filter(file => {
                if (file.size > MAX_FILE_SIZE) {
                    alert(
                        `${file.name} exceeds 50MB limit`
                    );
                    return false;
                }
                return true;
            });
        setFiles((prev) => {
            const combined = [...prev, ...validFiles];

            return combined.filter(
                (file, index, self) =>
                    index ===
                    self.findIndex(
                        (f) =>
                            f.name === file.name &&
                            f.size === file.size &&
                            f.lastModified === file.lastModified
                    )
            );
        });
    };

    const onDrop = (acceptedFiles: File[]) => {
        addFiles(acceptedFiles);
    };

    const removeFile = (indexToRemove: number) => {
        setFiles((prev) =>
            prev.filter((_, index) => index !== indexToRemove)
        );
    };

    const clearFiles = () => {
        setFiles([]);
    };

    const moveUp = (index: number) => {
        if (index === 0) return;

        const updated = [...files];

        [updated[index - 1], updated[index]] = [
            updated[index],
            updated[index - 1],
        ];

        setFiles(updated);
    };

    const moveDown = (index: number) => {
        if (index === files.length - 1) return;

        const updated = [...files];

        [updated[index + 1], updated[index]] = [
            updated[index],
            updated[index + 1],
        ];

        setFiles(updated);
    };

    const mergePdfs = async () => {
        if (files.length < 2) {
            alert("Please select at least 2 PDF files.");
            return;
        }

        try {
            setIsMerging(true);

            const mergedPdf = await PDFDocument.create();

            for (const file of files) {
                const arrayBuffer = await file.arrayBuffer();

                const pdf = await PDFDocument.load(arrayBuffer);

                const copiedPages = await mergedPdf.copyPages(
                    pdf,
                    pdf.getPageIndices()
                );

                copiedPages.forEach((page) => {
                    mergedPdf.addPage(page);
                });
            }

            const mergedPdfBytes = await mergedPdf.save();

            const blob = new Blob([mergedPdfBytes], {
                type: "application/pdf",
            });

            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");

            link.href = url;
            link.download = "merged.pdf";

            document.body.appendChild(link);

            link.click();

            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            alert(
                `Failed to merge PDFs.\n\n${getErrorMessage(error)}`
            );
        } finally {
            setIsMerging(false);
        }
    };

    const totalSizeMB = (
        files.reduce((sum, file) => sum + file.size, 0) /
        1024 /
        1024
    ).toFixed(2);

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Merge PDF"
                description="Combine multiple PDF files into a single document."
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
                    multiple
                    title="Upload PDFs"
                    description="Select multiple PDFs to merge"
                />

                {files.length > 0 && (
                    <>
                        <PdfFileList
                            files={files}
                            totalSizeMB={totalSizeMB}
                            onMoveUp={moveUp}
                            onMoveDown={moveDown}
                            onRemove={removeFile}
                            onClear={clearFiles}
                        />

                        <PdfActionButton
                            text={`Merge ${files.length} PDFs`}
                            loadingText="Merging PDFs..."
                            loading={isMerging}
                            onClick={mergePdfs}
                        />
                    </>
                )}
            </div>

            <PdfFeatures/>
        </PdfToolLayout>
    );
}