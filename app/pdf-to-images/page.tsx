"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";

import PdfThumbnailGrid from "@/components/pdf/PdfThumbnailGrid";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfDropzone from "@/components/pdf/PdfDropzone";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";

import { convertPdfToImages } from "@/lib/pdfToImages";
import { FileImage } from "lucide-react";
import PdfUploader from "@/components/pdf/PdfUploader";

export default function PdfToImagesPage() {
    const [thumbnails, setThumbnails] =
        useState<string[]>([]);

    const [file, setFile] =
        useState<File | null>(null);

    const [numPages, setNumPages] =
        useState(0);

    const [selectedPages, setSelectedPages] =
        useState<number[]>([]);

    const [format, setFormat] =
        useState<"png" | "jpeg">("png");

    const [quality, setQuality] =
        useState(2);

    const [loading, setLoading] =
        useState(false);

    const onDrop = async (
        acceptedFiles: File[]
    ) => {
        const uploadedFile =
            acceptedFiles[0];

        if (
            uploadedFile.size >
            50 * 1024 * 1024
        ) {
            alert(
                "PDF exceeds 50MB limit."
            );
            return;
        }
        if (!uploadedFile) return;

        setFile(uploadedFile);

        try {
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

            setNumPages(pdf.numPages);

            setSelectedPages(
                Array.from(
                    { length: pdf.numPages },
                    (_, i) => i + 1
                )
            );

            const generatedThumbnails: string[] =
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

                generatedThumbnails.push(
                    canvas.toDataURL(
                        "image/png"
                    )
                );
            }

            setThumbnails(
                generatedThumbnails
            );
        } catch (error) {
            console.error(error);

            alert(
                `Failed to load PDF.\n\n${getErrorMessage(error)}`
            );
        }
    };

    const {
        getRootProps,
        getInputProps,
        isDragActive,
    } = useDropzone({
        accept: {
            "application/pdf": [".pdf"],
        },
        multiple: false,
        onDrop,
    });

    const togglePage = (
        pageNumber: number
    ) => {
        setSelectedPages((prev) =>
            prev.includes(pageNumber)
                ? prev.filter(
                    (p) =>
                        p !== pageNumber
                )
                : [...prev, pageNumber]
        );
    };

    const handleConvert =
        async () => {
            if (!file) return;

            try {
                setLoading(true);

                await convertPdfToImages(
                    file,
                    format,
                    selectedPages,
                    quality
                );
            } catch (error) {
                console.error(error);

                alert(
                    "Failed to convert PDF."
                );
            } finally {
                setLoading(false);
            }
        };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="PDF to Images"
                description="Convert PDF pages into PNG or JPG images."
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
                    description="Select a PDF to convert"
                />

                {file && (
                    <div className="mt-8 space-y-6">
                        <div
                            className="
                            rounded-xl
                            border
                            border-[color:var(--border)]
                            p-4
                        "
                        >
                            <div className="flex items-center gap-3">
                                <FileImage className="h-5 w-5" />

                                <div>
                                    <p className="font-semibold">
                                        {
                                            file.name
                                        }
                                    </p>

                                    <p className="text-sm text-[color:var(--muted)]">
                                        {
                                            numPages
                                        }{" "}
                                        pages
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block font-medium">
                                Image Format
                            </label>

                            <select
                                value={
                                    format
                                }
                                onChange={(
                                    e
                                ) =>
                                    setFormat(
                                        e
                                            .target
                                            .value as
                                            | "png"
                                            | "jpeg"
                                    )
                                }
                                className="
                                w-full
                                rounded-xl
                                border
                                border-[color:var(--border)]
                                bg-[var(--card)]
                                p-4
                            "
                            >
                                <option value="png">
                                    PNG
                                </option>

                                <option value="jpeg">
                                    JPG
                                </option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block font-medium">
                                Quality
                            </label>

                            <select
                                value={
                                    quality
                                }
                                onChange={(
                                    e
                                ) =>
                                    setQuality(
                                        Number(
                                            e
                                                .target
                                                .value
                                        )
                                    )
                                }
                                className="
                                w-full
                                rounded-xl
                                border
                                border-[color:var(--border)]
                                bg-[var(--card)]
                                p-4
                            "
                            >
                                <option value={1}>
                                    Low
                                </option>
                                <option value={2}>
                                    Medium
                                </option>
                                <option value={3}>
                                    High
                                </option>
                                <option value={4}>
                                    Ultra
                                </option>
                            </select>
                        </div>

                        {thumbnails.length > 0 && (
                            <>
                                <div
                                    className="
                flex
                flex-col
                gap-4
                rounded-2xl
                border
                border-[color:var(--border)]
                p-4
                md:flex-row
                md:items-center
                md:justify-between
            "
                                >
                                    <div>
                                        <h3 className="font-semibold">
                                            Page Selection
                                        </h3>

                                        <p className="text-sm text-[color:var(--muted)]">
                                            {selectedPages.length} of {numPages} pages selected
                                        </p>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() =>
                                                setSelectedPages(
                                                    Array.from(
                                                        { length: numPages },
                                                        (_, i) => i + 1
                                                    )
                                                )
                                            }
                                            className="
                        rounded-xl
                        border
                        border-[color:var(--border)]
                        px-4
                        py-2
                        text-sm
                        font-medium
                        transition
                        hover:bg-slate-100
                        dark:hover:bg-slate-800
                    "
                                        >
                                            Select All
                                        </button>

                                        <button
                                            onClick={() =>
                                                setSelectedPages([])
                                            }
                                            className="
                        rounded-xl
                        border
                        border-red-500
                        px-4
                        py-2
                        text-sm
                        font-medium
                        text-red-500
                        transition
                        hover:bg-red-500
                        hover:text-white
                    "
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                <PdfThumbnailGrid
                                    thumbnails={thumbnails}
                                    selectedPages={selectedPages}
                                    onTogglePage={togglePage}
                                />
                            </>
                        )}

                        {selectedPages.length > 0 && (
                            <PdfActionButton
                                text={
                                    selectedPages.length === 1
                                        ? "Convert 1 Page"
                                        : `Convert ${selectedPages.length} Pages`
                                }
                                loadingText="Converting..."
                                loading={loading}
                                onClick={handleConvert}
                            />
                        )}
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}