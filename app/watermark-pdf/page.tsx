"use client";

import {useEffect, useState} from "react";
import {PDFDocument, StandardFonts, rgb, degrees} from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {getErrorMessage} from "@/lib/errorHandler";
import applyWatermark from "@/lib/watermark";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfUploader from "@/components/pdf/PdfUploader";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

type WatermarkPosition =
    | "center"
    | "topLeft"
    | "topRight"
    | "bottomLeft"
    | "bottomRight";

export default function WatermarkPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
    const [fontSize, setFontSize] = useState(48);
    const [opacity, setOpacity] = useState(0.3);
    const [position, setPosition] = useState<WatermarkPosition>("center");

    const [previewImage,
        setPreviewImage] =
        useState<string | null>(
            null
        );

    const [
        isPreviewLoading,
        setIsPreviewLoading,
    ] = useState(false);

    const createWatermarkedPdfPreview = async (
        sourceFile: File,
        text: string,
        size: number,
        alpha: number,
        pos: WatermarkPosition
    ) => {

        const sourceBytes =
            await sourceFile.arrayBuffer();

        const pdf =
            await PDFDocument.load(
                sourceBytes
            );

        await applyWatermark(
            pdf,
            text,
            size,
            alpha,
            pos
        );

        const previewPdfBytes =
            await pdf.save();

        const loadingTask =
            pdfjsLib.getDocument({
                data: previewPdfBytes,
            });

        const renderedPdf =
            await loadingTask.promise;

        const previewPage =
            await renderedPdf.getPage(1);

        const viewport =
            previewPage.getViewport({
                scale: 0.8,
            });

        const canvas =
            document.createElement(
                "canvas"
            );

        const context =
            canvas.getContext("2d");

        if (!context) {
            throw new Error(
                "Canvas context not available."
            );
        }

        canvas.width =
            viewport.width;

        canvas.height =
            viewport.height;

        await previewPage.render({
            canvasContext: context,
            viewport,
        }).promise;

        const image =
            canvas.toDataURL(
                "image/png"
            );

        return image;
    };

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const uploadedFile = acceptedFiles[0];

        if (uploadedFile.size > 50 * 1024 * 1024) {
            alert("PDF exceeds 50MB limit.");
            return;
        }

        setFile(uploadedFile);
    };

    useEffect(() => {
        if (!file) {
            setPreviewImage(null);
            return;
        }

        let cancelled = false;

        const timeout = setTimeout(
            async () => {
                try {
                    setIsPreviewLoading(
                        true
                    );

                    const image =
                        await createWatermarkedPdfPreview(
                            file,
                            watermarkText,
                            fontSize,
                            opacity,
                            position
                        );

                    if (!cancelled) {
                        setPreviewImage(
                            image
                        );
                    }
                } catch (error) {
                    console.error(error);
                } finally {
                    if (!cancelled) {
                        setIsPreviewLoading(
                            false
                        );
                    }
                }
            },
            250
        );

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [
        file,
        watermarkText,
        fontSize,
        opacity,
        position,
    ]);

    const addWatermark = async () => {
        if (!file) {
            alert("Please upload a PDF.");
            return;
        }

        if (!watermarkText.trim()) {
            alert("Please enter watermark text.");
            return;
        }

        try {
            setIsProcessing(true);

            const bytes = await file.arrayBuffer();
            const pdf =
                await PDFDocument.load(
                    bytes
                );

            await applyWatermark(
                pdf,
                watermarkText,
                fontSize,
                opacity,
                position
            );

            const pdfBytes = await pdf.save();

            const blob = new Blob([pdfBytes], {
                type: "application/pdf",
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = "watermarked.pdf";

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);

            alert(
                `Failed to add watermark.\n\n${getErrorMessage(error)}`
            );
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Watermark PDF"
                description="Add a text watermark to every page of your PDF."
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
                    description="Select a PDF to watermark"
                />

                {file && (
                    <div className="mt-8 space-y-6">
                        <PdfFileInfo file={file}/>

                        <div>
                            <label className="mb-2 block font-medium">
                                Watermark Text
                            </label>

                            <input
                                type="text"
                                value={watermarkText}
                                onChange={(e) =>
                                    setWatermarkText(e.target.value)
                                }
                                className="
                                    w-full
                                    rounded-xl
                                    border
                                    border-[color:var(--border)]
                                    bg-[var(--background)]
                                    p-4
                                "
                            />
                        </div>

                        <div>
                            <label className="mb-2 block font-medium">
                                Font Size ({fontSize}px)
                            </label>

                            <input
                                type="range"
                                min="20"
                                max="100"
                                value={fontSize}
                                onChange={(e) =>
                                    setFontSize(Number(e.target.value))
                                }
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block font-medium">
                                Opacity ({opacity})
                            </label>

                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.1"
                                value={opacity}
                                onChange={(e) =>
                                    setOpacity(Number(e.target.value))
                                }
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block font-medium">
                                Position
                            </label>

                            <select
                                value={position}
                                onChange={(e) =>
                                    setPosition(
                                        e.target.value as WatermarkPosition
                                    )
                                }
                                className="
                                    w-full
                                    rounded-xl
                                    border
                                    border-[color:var(--border)]
                                    bg-[var(--background)]
                                    p-4
                                "
                            >
                                <option value="center">Center</option>
                                <option value="topLeft">Top Left</option>
                                <option value="topRight">Top Right</option>
                                <option value="bottomLeft">Bottom Left</option>
                                <option value="bottomRight">Bottom Right</option>
                            </select>
                        </div>

                        <div
                            className="
                                rounded-2xl
                                border
                                border-[color:var(--border)]
                                bg-[var(--background)]
                                p-6
                            "
                        >
                            <h3 className="mb-4 font-semibold">
                                Watermark Preview
                            </h3>

                            <div
                                className="
                                    mx-auto
                                    h-[420px]
                                    max-w-[300px]
                                    overflow-hidden
                                    rounded-xl
                                    border
                                    border-[color:var(--border)]
                                    bg-white
                                    shadow-lg
                                "
                            >
                                {isPreviewLoading ? (
                                    <div
                                        className="
            flex
            h-full
            items-center
            justify-center
            text-sm
            text-[color:var(--muted)]
        "
                                    >
                                        Rendering Preview...
                                    </div>
                                ) : previewImage ? (
                                    <img
                                        src={previewImage}
                                        alt="Watermark preview"
                                        className="
            h-full
            w-full
            object-contain
        "
                                    />
                                ) : (
                                    <div
                                        className="
            flex
            h-full
            items-center
            justify-center
            text-sm
            text-[color:var(--muted)]
        "
                                    >
                                        Preview unavailable
                                    </div>
                                )}
                            </div>
                        </div>

                        <PdfActionButton
                            text="Add Watermark"
                            loadingText="Applying Watermark..."
                            loading={isProcessing}
                            onClick={addWatermark}
                        />
                    </div>
                )}
            </div>

            <PdfFeatures/>
        </PdfToolLayout>
    );
}