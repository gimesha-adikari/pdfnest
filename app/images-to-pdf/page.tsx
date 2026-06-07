"use client";

import {useEffect, useMemo, useState} from "react";
import {PDFDocument} from "pdf-lib";
import {ArrowDown, ArrowUp, Trash2, X} from "lucide-react";
import { getErrorMessage } from "@/lib/errorHandler";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfUploader from "@/components/pdf/PdfUploader";

type ImageItem = {
    id: string;
    file: File;
    preview: string;
};

export default function ImagesToPdfPage() {
    const [items, setItems] = useState<ImageItem[]>([]);
    const [isConverting, setIsConverting] = useState(false);

    const addFiles = (newFiles: File[]) => {
        const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB

        const validFiles = newFiles.filter((file) => {
            if (file.size > MAX_IMAGE_SIZE) {
                alert(`${file.name} is larger than 20 MB.`);
                return false;
            }

            return true;
        });

        setItems((prev) => {
            const existing = new Set(
                prev.map(
                    (item) =>
                        `${item.file.name}-${item.file.size}-${item.file.lastModified}`
                )
            );

            const nextItems: ImageItem[] = [];

            for (const file of validFiles) {
                const key =
                    `${file.name}-${file.size}-${file.lastModified}`;

                if (existing.has(key)) continue;

                nextItems.push({
                    id: crypto.randomUUID(),
                    file,
                    preview: URL.createObjectURL(file),
                });

                existing.add(key);
            }

            return [...prev, ...nextItems];
        });
    };

    const onDrop = (acceptedFiles: File[]) => {
        addFiles(acceptedFiles);
    };

    useEffect(() => {
        return () => {
            items.forEach(item =>
                URL.revokeObjectURL(item.preview)
            );
        };
    }, []);

    const removeFile = (indexToRemove: number) => {
        setItems((prev) => {
            const target = prev[indexToRemove];
            if (target) URL.revokeObjectURL(target.preview);
            return prev.filter((_, index) => index !== indexToRemove);
        });
    };

    const clearFiles = () => {
        items.forEach((item) => URL.revokeObjectURL(item.preview));
        setItems([]);
    };

    const moveUp = (index: number) => {
        if (index === 0) return;

        setItems((prev) => {
            const updated = [...prev];
            [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
            return updated;
        });
    };

    const moveDown = (index: number) => {
        if (index === items.length - 1) return;

        setItems((prev) => {
            const updated = [...prev];
            [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
            return updated;
        });
    };

    const convertToPngBytes = async (file: File): Promise<Uint8Array> => {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();

            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;

                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        URL.revokeObjectURL(objectUrl);
                        reject(new Error("Canvas not supported"));
                        return;
                    }

                    ctx.drawImage(img, 0, 0);

                    canvas.toBlob(
                        async (blob) => {
                            URL.revokeObjectURL(objectUrl);

                            if (!blob) {
                                reject(new Error("Failed to convert image"));
                                return;
                            }

                            const buffer = await blob.arrayBuffer();
                            resolve(new Uint8Array(buffer));
                        },
                        "image/png",
                        1
                    );
                } catch (error) {
                    URL.revokeObjectURL(objectUrl);
                    reject(error);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Failed to load image"));
            };

            img.src = objectUrl;
        });
    };

    const convertImagesToPdf = async () => {
        if (items.length === 0) {
            alert("Please upload at least one image.");
            return;
        }

        try {
            setIsConverting(true);

            const pdf = await PDFDocument.create();

            for (const item of items) {
                const file = item.file;
                const mime = file.type.toLowerCase();
                const rawBytes = await file.arrayBuffer();

                let embeddedImage;

                if (mime === "image/jpeg" || mime === "image/jpg") {
                    embeddedImage = await pdf.embedJpg(rawBytes);
                } else if (mime === "image/png") {
                    embeddedImage = await pdf.embedPng(rawBytes);
                } else {
                    const pngBytes = await convertToPngBytes(file);
                    embeddedImage = await pdf.embedPng(pngBytes);
                }

                const page = pdf.addPage([embeddedImage.width, embeddedImage.height]);

                page.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: embeddedImage.width,
                    height: embeddedImage.height,
                });
            }

            const pdfBytes = await pdf.save();

            const blob = new Blob([pdfBytes], {
                type: "application/pdf",
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = "images-to-pdf.pdf";

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            alert(`Failed to convert images to PDF.\\n\\n${getErrorMessage(error)}`);
        } finally {
            setIsConverting(false);
        }
    };

    const totalSizeMB = useMemo(() => {
        return (
            items.reduce((sum, item) => sum + item.file.size, 0) /
            1024 /
            1024
        ).toFixed(2);
    }, [items]);

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Image to PDF"
                description="Upload images, arrange them, and convert them into a single PDF."
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
                    accept={{
                        "image/*": [
                            ".jpg",
                            ".jpeg",
                            ".png",
                            ".webp",
                            ".bmp",
                            ".gif",
                        ],
                    }}
                    title="Upload Images"
                    description="Select JPG, PNG, WEBP, BMP and GIF files"
                />

                {items.length > 0 && (
                    <div className="mt-8">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-xl font-semibold">
                                    Selected Images ({items.length})
                                </h3>
                                <p className="mt-1 text-sm text-[color:var(--muted)]">
                                    Total Size: {totalSizeMB} MB
                                </p>
                            </div>

                            <button
                                onClick={clearFiles}
                                className="
                  inline-flex
                  items-center
                  gap-2
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
                                <Trash2 size={16}/>
                                Clear All
                            </button>
                        </div>

                        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map((item, index) => (
                                <div
                                    key={item.id}
                                    className="
                    overflow-hidden
                    rounded-2xl
                    border
                    border-[color:var(--border)]
                    bg-[var(--background)]
                    shadow-sm
                  "
                                >
                                    <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800">
                                        <img
                                            src={item.preview}
                                            alt={item.file.name}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>

                                    <div className="p-4">
                                        <p className="truncate font-semibold">
                                            #{index + 1} • {item.file.name}
                                        </p>

                                        <p className="mt-1 text-sm text-[color:var(--muted)]">
                                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                                        </p>

                                        <div className="mt-4 flex gap-2">
                                            <button
                                                onClick={() => moveUp(index)}
                                                disabled={index === 0}
                                                className="
                          inline-flex
                          flex-1
                          items-center
                          justify-center
                          gap-2
                          rounded-lg
                          border
                          border-[color:var(--border)]
                          px-3
                          py-2
                          text-sm
                          disabled:opacity-30
                        "
                                            >
                                                <ArrowUp size={16}/>
                                                Up
                                            </button>

                                            <button
                                                onClick={() => moveDown(index)}
                                                disabled={index === items.length - 1}
                                                className="
                          inline-flex
                          flex-1
                          items-center
                          justify-center
                          gap-2
                          rounded-lg
                          border
                          border-[color:var(--border)]
                          px-3
                          py-2
                          text-sm
                          disabled:opacity-30
                        "
                                            >
                                                <ArrowDown size={16}/>
                                                Down
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => removeFile(index)}
                                            className="
                        mt-2
                        w-full
                        rounded-lg
                        bg-red-500
                        px-3
                        py-2
                        text-sm
                        font-medium
                        text-white
                        transition
                        hover:bg-red-600
                      "
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <PdfActionButton
                            text={`Convert ${items.length} Image${items.length === 1 ? "" : "s"} to PDF`}
                            loadingText="Converting..."
                            loading={isConverting}
                            onClick={convertImagesToPdf}
                        />
                    </div>
                )}
            </div>

            <PdfFeatures/>
        </PdfToolLayout>
    );
}