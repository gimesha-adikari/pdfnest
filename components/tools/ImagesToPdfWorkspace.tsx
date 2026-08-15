"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ChevronLeft,
    ChevronRight,
    Image as ImageIcon,
    Layers,
    LayoutGrid,
    Move,
    PlusCircle,
    Redo2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Undo2,
    X,
    FileImage,
} from "lucide-react";
import { handleClientError } from "@/lib/errorHandler";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";
import Link from "next/link";

interface CanvasItem {
    id: string;
    fileIndex: number;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    borderWidth: number;
    borderColor: string;
    zIndex: number;
    aspectRatio: number;
    pageIndex: number; // Identifies which canvas page layout context the node belongs to
}

type InteractionMode =
    | "move"
    | "resize-nw"
    | "resize-n"
    | "resize-ne"
    | "resize-e"
    | "resize-se"
    | "resize-s"
    | "resize-sw"
    | "resize-w";

interface InteractionState {
    itemId: string;
    mode: InteractionMode;
    startX: number;
    startY: number;
    itemsStartPositions: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}

function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ImagesToPdfWorkspace() {
    const {
        requireAuth,
        subscription,
        isGuest,
        isLoggedIn,
    } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [images, setImages] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");

    const [activeTab, setActiveTab] = useState<"standard" | "custom">("standard");
    const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

    const [showUpgradeAd, setShowUpgradeAd] = useState(false);
    const [showLoginAd, setShowLoginAd] = useState(false);

    const [customPagesCount, setCustomPagesCount] = useState<number>(1);

    const [history, setHistory] = useState<CanvasItem[][]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    const [interaction, setInteraction] = useState<InteractionState | null>(null);
    const canvasRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

    const isPro = subscription?.tier === "pro";

    const canvasWidth = 595;
    const canvasHeight = 842;

    const totalSizeBytes = useMemo(() => images.reduce((sum, img) => sum + img.size, 0), [images]);
    const totalSizeFormatted = useMemo(() => formatFileSize(totalSizeBytes), [totalSizeBytes]);

    useEffect(() => {
        if (file && images.length === 0) {
            const batch = (file as any).initialBatch as File[];
            if (batch && batch.length > 0) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setImages(batch);
            } else {
                setImages([file]);
            }
        }
    }, [file]);

    useEffect(() => {
        if (images.length === 0) return;

        // Only run grid generation if no canvas items are already configured (preserves custom modifications on added assets)
        if (canvasItems.length > 0) return;

        const loadGrid = async () => {
            const baseDimension = 180;
            const padding = 25;
            const itemsPerRow = Math.floor((canvasWidth - padding) / (baseDimension + padding)) || 1;

            const initializedItems = await Promise.all(
                images.map((img, idx) => {
                    return new Promise<CanvasItem>((resolve) => {
                        const url = URL.createObjectURL(img);
                        const htmlImg = new window.Image();
                        htmlImg.onload = () => {
                            URL.revokeObjectURL(url);
                            const aspect = htmlImg.naturalWidth / htmlImg.naturalHeight || 1;

                            let targetW = baseDimension;
                            let targetH = baseDimension / aspect;

                            if (targetH > baseDimension) {
                                targetH = baseDimension;
                                targetW = baseDimension * aspect;
                            }

                            const row = Math.floor(idx / itemsPerRow);
                            const col = idx % itemsPerRow;
                            const posX = padding + col * (baseDimension + padding);
                            const posY = padding + row * (baseDimension + padding);

                            resolve({
                                id: `canvas-item-${idx}-${img.name}`,
                                fileIndex: idx,
                                name: img.name,
                                x: posX + targetW <= canvasWidth ? posX : padding,
                                y: posY + targetH <= canvasHeight ? posY : padding,
                                width: Math.round(targetW),
                                height: Math.round(targetH),
                                borderWidth: 0,
                                borderColor: "#000000",
                                zIndex: idx + 1,
                                aspectRatio: aspect,
                                pageIndex: 0,
                            });
                        };
                        htmlImg.onerror = () => {
                            resolve({
                                id: `canvas-item-${idx}-${img.name}`,
                                fileIndex: idx,
                                name: img.name,
                                x: padding,
                                y: padding,
                                width: baseDimension,
                                height: baseDimension,
                                borderWidth: 0,
                                borderColor: "#000000",
                                zIndex: idx + 1,
                                aspectRatio: 1,
                                pageIndex: 0,
                            });
                        };
                        htmlImg.src = url;
                    });
                })
            );
            setCanvasItems(initializedItems);
            setHistory([initializedItems]);
            setHistoryIndex(0);
            setCustomPagesCount(1);
        };

        loadGrid();
    }, [images]);

    const pushToHistory = (newItems: CanvasItem[]) => {
        const cleanHistory = history.slice(0, historyIndex + 1);
        setHistory([...cleanHistory, JSON.parse(JSON.stringify(newItems))]);
        setHistoryIndex(cleanHistory.length);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const nextIdx = historyIndex - 1;
            setHistoryIndex(nextIdx);
            setCanvasItems(JSON.parse(JSON.stringify(history[nextIdx])));
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIdx = historyIndex + 1;
            setHistoryIndex(nextIdx);
            setCanvasItems(JSON.parse(JSON.stringify(history[nextIdx])));
        }
    };

    useEffect(() => {
        const handleShortcuts = (e: KeyboardEvent) => {
            if (activeTab !== "custom") return;
            const isMod = e.ctrlKey || e.metaKey;

            if (isMod && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            } else if (isMod && e.key.toLowerCase() === "y") {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener("keydown", handleShortcuts);
        return () => window.removeEventListener("keydown", handleShortcuts);
    }, [history, historyIndex, activeTab]);

    const handleInteractionStart = (e: React.PointerEvent, item: CanvasItem, mode: InteractionMode) => {
        e.stopPropagation();
        e.preventDefault();

        let updatedSelection = [...selectedItemIds];
        if (e.ctrlKey || e.metaKey) {
            if (selectedItemIds.includes(item.id)) {
                updatedSelection = selectedItemIds.filter((id) => id !== item.id);
            } else {
                updatedSelection.push(item.id);
            }
        } else {
            updatedSelection = [item.id];
        }
        setSelectedItemIds(updatedSelection);

        const targets = canvasItems.filter((i) => updatedSelection.includes(i.id));
        const itemsStartPositions = targets.map((t) => ({
            id: t.id,
            x: t.x,
            y: t.y,
            width: t.width,
            height: t.height,
        }));

        setInteraction({
            itemId: item.id,
            mode,
            startX: e.clientX,
            startY: e.clientY,
            itemsStartPositions,
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleInteractionMove = (e: React.PointerEvent) => {
        if (!interaction) return;

        const dx = e.clientX - interaction.startX;
        const dy = e.clientY - interaction.startY;

        setCanvasItems((prevItems) => {
            return prevItems.map((item) => {
                const matchStart = interaction.itemsStartPositions.find((p) => p.id === item.id);
                if (!matchStart) return item;

                // eslint-disable-next-line prefer-const
                let { x, y, width, height, aspectRatio } = item;
                const minSize = 40;

                if (interaction.mode === "move") {
                    x = matchStart.x + dx;
                    y = matchStart.y + dy;

                    if (x < 0) x = 0;
                    if (x + width > canvasWidth) x = canvasWidth - width;
                    if (y < 0) y = 0;
                    if (y + height > canvasHeight) y = canvasHeight - height;
                } else {
                    if (item.id !== interaction.itemId) return item;

                    if (interaction.mode === "resize-e" || interaction.mode === "resize-se") {
                        width = Math.max(minSize, matchStart.width + dx);
                        height = width / aspectRatio;
                    } else if (interaction.mode === "resize-s") {
                        height = Math.max(minSize, matchStart.height + dy);
                        width = height * aspectRatio;
                    } else if (interaction.mode === "resize-w") {
                        const computedW = Math.max(minSize, matchStart.width - dx);
                        x = matchStart.x + (matchStart.width - computedW);
                        width = computedW;
                        height = width / aspectRatio;
                    } else if (interaction.mode === "resize-n") {
                        const computedH = Math.max(minSize, matchStart.height - dy);
                        y = matchStart.y + (matchStart.height - computedH);
                        height = computedH;
                        width = height * aspectRatio;
                    } else if (interaction.mode === "resize-nw") {
                        width = Math.max(minSize, matchStart.width - dx);
                        height = width / aspectRatio;
                        x = matchStart.x + (matchStart.width - width);
                        y = matchStart.y + (matchStart.height - height);
                    } else if (interaction.mode === "resize-ne") {
                        width = Math.max(minSize, matchStart.width + dx);
                        height = width / aspectRatio;
                        y = matchStart.y + (matchStart.height - height);
                    } else if (interaction.mode === "resize-sw") {
                        width = Math.max(minSize, matchStart.width - dx);
                        height = width / aspectRatio;
                        x = matchStart.x + (matchStart.width - width);
                    }

                    if (x < 0) x = 0;
                    if (y < 0) y = 0;
                    if (x + width > canvasWidth) width = canvasWidth - x;
                    if (y + height > canvasHeight) height = canvasHeight - y;
                }

                return {
                    ...item,
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(width),
                    height: Math.round(height),
                };
            });
        });
    };

    const handleInteractionEnd = (e: React.PointerEvent) => {
        if (interaction) {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            setInteraction(null);
            pushToHistory(canvasItems);
        }
    };

    const handleFilesSelection = async (acceptedFiles: File[]) => {
        const startIdx = images.length;
        setImages((prev) => [...prev, ...acceptedFiles]);
        setSuccess(false);

        const padding = 25;
        const newCanvasItems: CanvasItem[] = await Promise.all(
            acceptedFiles.map((img, index) => {
                const globalIndex = startIdx + index;
                return new Promise<CanvasItem>((resolve) => {
                    const url = URL.createObjectURL(img);
                    const htmlImg = new window.Image();
                    htmlImg.onload = () => {
                        URL.revokeObjectURL(url);
                        const aspect = htmlImg.naturalWidth / htmlImg.naturalHeight || 1;
                        resolve({
                            id: `canvas-item-${globalIndex}-${img.name}-${Date.now()}`,
                            fileIndex: globalIndex,
                            name: img.name,
                            x: padding + index * 20,
                            y: padding + index * 20,
                            width: 150,
                            height: Math.round(150 / aspect),
                            borderWidth: 0,
                            borderColor: "#000000",
                            zIndex: globalIndex + 1,
                            aspectRatio: aspect,
                            pageIndex: 0,
                        });
                    };
                    htmlImg.src = url;
                });
            })
        );

        setCanvasItems((prev) => {
            const merged = [...prev, ...newCanvasItems];
            pushToHistory(merged);
            return merged;
        });
    };

    const removeImageElement = (indexToRemove: number) => {
        const updatedImages = images.filter((_, idx) => idx !== indexToRemove);
        setImages(updatedImages);

        setSelectedItemIds([]);

        if (updatedImages.length === 0) {
            setCanvasItems([]);
            setHistory([]);
            setHistoryIndex(-1);
            setFile(null);
            router.push(`/${toolId}`);
            return;
        }

        setCanvasItems((prevItems) => {
            const filteredAndReindexed = prevItems
                .filter((item) => item.fileIndex !== indexToRemove)
                .map((item) => {
                    if (item.fileIndex > indexToRemove) {
                        return { ...item, fileIndex: item.fileIndex - 1 };
                    }
                    return item;
                });
            pushToHistory(filteredAndReindexed);
            return filteredAndReindexed;
        });
    };

    const moveImageElement = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= images.length || fromIndex === toIndex) return;

        const nextImages = [...images];
        const [movedImage] = nextImages.splice(fromIndex, 1);
        nextImages.splice(toIndex, 0, movedImage);
        setImages(nextImages);

        setCanvasItems((prevItems) => {
            const updated = prevItems.map((item) => {
                if (item.fileIndex === fromIndex) {
                    return { ...item, fileIndex: toIndex };
                }
                if (fromIndex < toIndex) {
                    if (item.fileIndex > fromIndex && item.fileIndex <= toIndex) {
                        return { ...item, fileIndex: item.fileIndex - 1 };
                    }
                } else {
                    if (item.fileIndex >= toIndex && item.fileIndex < fromIndex) {
                        return { ...item, fileIndex: item.fileIndex + 1 };
                    }
                }
                return item;
            });
            pushToHistory(updated);
            return updated;
        });
    };

    const deleteSelectedCanvasItem = (itemIdToDelete: string) => {
        const item = canvasItems.find((i) => i.id === itemIdToDelete);
        if (item) {
            removeImageElement(item.fileIndex);
        }
    };

    const updateSelectedItemsFields = (fieldsCalculator: (item: CanvasItem) => Partial<CanvasItem>) => {
        const nextState = canvasItems.map((item) => {
            if (selectedItemIds.includes(item.id)) {
                return { ...item, ...fieldsCalculator(item) };
            }
            return item;
        });
        setCanvasItems(nextState);
    };

    const handleCompilePdf = async () => {
        requireAuth(async () => {
            if (images.length === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                let params: Record<string, any> = {};

                if (activeTab === "custom" && isPro) {
                    const activePageIndices = Array.from(new Set(canvasItems.map((item) => item.pageIndex))).sort((a, b) => a - b);

                    const optimizedLayout = canvasItems
                        .filter((item) => activePageIndices.includes(item.pageIndex))
                        .map((item) => {
                            const finalPageIndex = activePageIndices.indexOf(item.pageIndex);
                            return {
                                ...item,
                                pageIndex: finalPageIndex,
                                x: (item.x / canvasWidth) * 350,
                                y: (item.y / canvasHeight) * 495,
                                width: (item.width / canvasWidth) * 350,
                                height: (item.height / canvasHeight) * 495,
                            };
                        });

                    params = {
                        canvasLayout: optimizedLayout,
                    };
                }

                const response = await ExecutionManager.run({
                    tool: "images_to_pdf",
                    files: images,
                    params,
                    mode: processingMode,
                });

                setDownloadData({
                    blob: response.blob,
                    fileName: activeTab === "custom" ? "custom-layout-compiled.pdf" : "compiled-images.pdf",
                });

                setSuccess(true);
                setImages([]);
                router.push(`/${toolId}/download`);
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const leadingItem = canvasItems.find((i) => selectedItemIds.includes(i.id)) || null;

    const handleAddNewPage = () => {
        setCustomPagesCount((prev) => prev + 1);
    };

    return (
        <div className={`w-full ${activeTab === "custom" ? "max-w-7xl" : "max-w-6xl"} mx-auto space-y-6`}>
            <PdfToolHero
                title="Convert Images to PDF"
                description="Package multiple high-resolution graphics, photos, or documents into a single optimized vector PDF container."
            />

            {/* MODE SWITCHER / TAB BAR */}
            <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-4">
                <div className="p-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-[color:var(--border)] inline-flex gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab("standard")}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
                            activeTab === "standard"
                                ? "bg-white dark:bg-neutral-800 text-[color:var(--foreground)] shadow-sm"
                                : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                        }`}
                    >
                        <LayoutGrid size={14} className={activeTab === "standard" ? "text-indigo-500" : ""} />
                        Standard Matrix Stack
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (isGuest) {
                                setShowLoginAd(true);
                                return;
                            }
                            if (!isPro) {
                                setShowUpgradeAd(true);
                                return;
                            }
                            setActiveTab("custom");
                        }}
                        className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition ${
                            activeTab === "custom"
                                ? "bg-white dark:bg-neutral-800 text-[color:var(--foreground)] shadow-sm"
                                : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                        } ${!isPro ? "opacity-75" : ""}`}
                    >
                        <Layers size={14} className={activeTab === "custom" ? "text-purple-500" : ""} />
                        Interactive Custom Canvas
                        {!isPro && (
                            <span className="text-[9px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Pro
                            </span>
                        )}
                    </button>
                </div>

                {activeTab === "custom" && isPro && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleAddNewPage}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                        >
                            <PlusCircle size={13} /> Add Page
                        </button>
                        <div className="flex items-center gap-1 border-l pl-2 border-[color:var(--border)]">
                            <button
                                type="button"
                                onClick={handleUndo}
                                disabled={historyIndex <= 0}
                                title="Undo (Ctrl+Z)"
                                className="p-1.5 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-[color:var(--foreground)]"
                            >
                                <Undo2 size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={handleRedo}
                                disabled={historyIndex >= history.length - 1}
                                title="Redo (Ctrl+Y)"
                                className="p-1.5 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-[color:var(--foreground)]"
                            >
                                <Redo2 size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* TAB 1: STANDARD MATRIX MODE (COMPACT 2-COLUMN LAYOUT) */}
            {activeTab === "standard" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* LEFT COLUMN: UPLOAD & IMAGE QUEUE */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* Compact Upload Card */}
                        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4 shadow-sm">
                            <PdfUploader
                                onFilesAccepted={handleFilesSelection}
                                title="Upload Additional Images"
                                description="Drop PNG, JPEG, WebP, GIF, or BMP images here"
                                multiple={true}
                                accept="image/*"
                            />
                        </div>

                        {/* Image Queue Section */}
                        {images.length > 0 && (
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
                                <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--foreground)]">
                                            Document Sequence ({images.length})
                                        </h3>
                                        <span className="text-[10px] text-[color:var(--muted)] bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 rounded-full border border-[color:var(--border)]">
                                            {totalSizeFormatted}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImages([]);
                                            setCanvasItems([]);
                                            setFile(null);
                                            router.push(`/${toolId}`);
                                        }}
                                        className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1 transition"
                                    >
                                        <Trash2 size={12} /> Clear Queue
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {images.map((img, index) => {
                                        const localPreviewUrl = URL.createObjectURL(img);
                                        return (
                                            <div
                                                key={`${img.name}-${index}-${img.lastModified}`}
                                                className="group relative rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden shadow-sm flex flex-col justify-between transition hover:border-indigo-500/50 hover:shadow-md"
                                            >
                                                {/* Top Action / Index Bar */}
                                                <div className="flex items-center justify-between p-1.5 border-b border-[color:var(--border)] bg-neutral-50 dark:bg-neutral-900/50">
                                                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                                        Page {index + 1}
                                                    </span>
                                                    <div className="flex items-center gap-0.5">
                                                        <button
                                                            type="button"
                                                            disabled={index === 0}
                                                            onClick={() => moveImageElement(index, index - 1)}
                                                            title="Move Earlier"
                                                            className="p-1 rounded text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                                                        >
                                                            <ChevronLeft size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={index === images.length - 1}
                                                            onClick={() => moveImageElement(index, index + 1)}
                                                            title="Move Later"
                                                            className="p-1 rounded text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                                                        >
                                                            <ChevronRight size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeImageElement(index)}
                                                            title="Remove Image"
                                                            className="p-1 rounded text-[color:var(--muted)] hover:text-red-500 hover:bg-red-500/10 transition"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Fixed Thumbnail Viewport with object-contain */}
                                                <div className="h-32 w-full p-2 flex items-center justify-center bg-black/5 dark:bg-black/30 overflow-hidden">
                                                    <img
                                                        src={localPreviewUrl}
                                                        alt={img.name}
                                                        className="max-h-full max-w-full object-contain rounded transition-transform group-hover:scale-105"
                                                        onLoad={() => URL.revokeObjectURL(localPreviewUrl)}
                                                    />
                                                </div>

                                                {/* Card Footer with File Info */}
                                                <div className="p-2 border-t border-[color:var(--border)] bg-neutral-50 dark:bg-neutral-900/30">
                                                    <p className="text-xs font-semibold text-[color:var(--foreground)] truncate" title={img.name}>
                                                        {img.name}
                                                    </p>
                                                    <p className="text-[10px] text-[color:var(--muted)] font-medium">
                                                        {formatFileSize(img.size)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: CONFIGURATION, VENUE & PRIMARY ACTION */}
                    <div className="lg:col-span-4 sticky top-6 space-y-5">
                        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-6">
                            {/* Summary Details */}
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--foreground)] mb-4 flex items-center gap-2">
                                    <SlidersHorizontal size={14} className="text-indigo-500" />
                                    Compilation Profile
                                </h3>

                                <div className="space-y-2.5 text-xs">
                                    <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                                        <span className="text-[color:var(--muted)]">Output Canvas</span>
                                        <span className="font-semibold text-[color:var(--foreground)]">ISO A4 Portrait (595 × 842 pt)</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                                        <span className="text-[color:var(--muted)]">Dimension Fit</span>
                                        <span className="font-semibold text-[color:var(--foreground)]">Aspect Ratio Auto-Scale</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                                        <span className="text-[color:var(--muted)]">Document Pages</span>
                                        <span className="font-semibold text-indigo-500 font-mono">{images.length} {images.length === 1 ? "Page" : "Pages"}</span>
                                    </div>
                                    <div className="flex justify-between py-1">
                                        <span className="text-[color:var(--muted)]">Total Input Size</span>
                                        <span className="font-semibold text-[color:var(--foreground)] font-mono">{totalSizeFormatted}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Execution Mode Selector */}
                            <div className="pt-2 border-t border-[color:var(--border)]">
                                <ProcessingModeSelector
                                    mode={processingMode}
                                    onChange={setProcessingMode}
                                    disabled={isProcessing}
                                />
                            </div>

                            {/* Success Notification */}
                            {success && (
                                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                                    <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={15} />
                                    <div className="text-xs">
                                        <p className="font-semibold">Conversion Complete</p>
                                        <p className="text-emerald-800/80 dark:text-emerald-200/70 text-[11px] mt-0.5">
                                            Your PDF package has been generated and is ready to download.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Primary Action Button */}
                            <div className="pt-2">
                                <PdfActionButton
                                    text={images.length === 1 ? "Compile 1 Image into PDF" : `Compile ${images.length} Images into PDF`}
                                    loadingText="Compiling Images into PDF..."
                                    loading={isProcessing}
                                    disabled={isProcessing || images.length === 0}
                                    onClick={handleCompilePdf}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: CUSTOM CANVAS MODE (INTERACTIVE PRO CANVAS) */}
            {activeTab === "custom" && isPro && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
                    {/* CANVAS VIEWPORT AREA (PRIORITY WIDTH, NEVER COMPRESSED) */}
                    <div
                        onPointerDown={(e) => {
                            if (!(e.target as HTMLElement).closest('.cursor-move')) setSelectedItemIds([]);
                        }}
                        onClick={(e) => {
                            if (!(e.target as HTMLElement).closest('.cursor-move')) setSelectedItemIds([]);
                        }}
                        className="w-full min-w-0 border border-[color:var(--border)] rounded-2xl p-6 lg:p-8 overflow-x-auto overflow-y-auto flex flex-col gap-8 items-center max-h-[850px] shadow-inner bg-neutral-900/10 dark:bg-black/40"
                    >
                        {Array.from({length: customPagesCount}).map((_, pageIdx) => {
                            const itemsOnThisPage = canvasItems.filter((item) => item.pageIndex === pageIdx);

                            return (
                                <div key={`page-${pageIdx}`} className="flex flex-col items-center gap-2 shrink-0">
                                    <div className="w-full flex items-center justify-between text-xs font-bold text-[color:var(--muted)] px-1">
                                        <span>Page Canvas #{pageIdx + 1}</span>
                                        <span>{itemsOnThisPage.length} Object{itemsOnThisPage.length !== 1 ? "s" : ""} Placed</span>
                                    </div>

                                    {/* Standalone non-deformed ISO A4 Canvas Container */}
                                    <div
                                        ref={(el) => {
                                            canvasRefs.current[pageIdx] = el;
                                        }}
                                        style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
                                        className="w-[595px] h-[842px] shrink-0 relative bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 shadow-2xl rounded-sm overflow-hidden select-none"
                                        onPointerMove={handleInteractionMove}
                                        onPointerUp={handleInteractionEnd}
                                        onPointerDown={(e) => {
                                            if (!(e.target as HTMLElement).closest('.cursor-move')) setSelectedItemIds([]);
                                        }}
                                        onClick={(e) => {
                                            if (!(e.target as HTMLElement).closest('.cursor-move')) setSelectedItemIds([]);
                                        }}
                                    >
                                        {/* Canvas Grid Background Guide */}
                                        <div
                                            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07] pointer-events-none"
                                            style={{
                                                backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
                                                backgroundSize: "20px 20px",
                                            }}
                                        />

                                        {itemsOnThisPage.map((item) => {
                                            const isSelected = selectedItemIds.includes(item.id);
                                            const sourceImage = images[item.fileIndex];
                                            const itemPreview = sourceImage ? URL.createObjectURL(sourceImage) : "";

                                            return (
                                                <div
                                                    key={item.id}
                                                    onPointerDown={(e) => handleInteractionStart(e, item, "move")}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedItemIds([item.id]);
                                                    }}
                                                    style={{
                                                        transform: `translate3d(${item.x}px, ${item.y}px, 0px)`,
                                                        width: `${item.width}px`,
                                                        height: `${item.height}px`,
                                                        zIndex: item.zIndex,
                                                        borderWidth: `${item.borderWidth}px`,
                                                        borderColor: item.borderColor,
                                                        borderStyle: item.borderWidth > 0 ? "solid" : "none",
                                                    }}
                                                    className={`absolute group cursor-move touch-none ${
                                                        isSelected
                                                            ? "ring-2 ring-indigo-500 shadow-xl"
                                                            : "hover:ring-1 hover:ring-indigo-500/50"
                                                    }`}
                                                >
                                                    {itemPreview && (
                                                        <img
                                                            src={itemPreview}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover pointer-events-none select-none"
                                                            onLoad={() => URL.revokeObjectURL(itemPreview)}
                                                        />
                                                    )}

                                                    {isSelected && (
                                                        <>
                                                            <div
                                                                onPointerDown={(e) => handleInteractionStart(e, item, "resize-nw")}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-nw-resize z-30 shadow-md"
                                                            />
                                                            <div
                                                                onPointerDown={(e) => handleInteractionStart(e, item, "resize-ne")}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-ne-resize z-30 shadow-md"
                                                            />
                                                            <div
                                                                onPointerDown={(e) => handleInteractionStart(e, item, "resize-se")}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-se-resize z-30 shadow-md"
                                                            />
                                                            <div
                                                                onPointerDown={(e) => handleInteractionStart(e, item, "resize-sw")}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-sw-resize z-30 shadow-md"
                                                            />
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Canvas Controls Sidebar (Sticky 340px) */}
                    <div className="w-full lg:w-[340px] shrink-0 border border-[color:var(--border)] rounded-2xl p-5 bg-[color:var(--card)] flex flex-col justify-between space-y-6 sticky top-6 shadow-sm">
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-[color:var(--foreground)] uppercase tracking-wider flex items-center gap-2">
                                <SlidersHorizontal size={14} className="text-indigo-500" /> Canvas Properties
                            </h4>

                            {leadingItem ? (
                                <div className="space-y-3.5">
                                    <div className="flex items-center justify-between pb-2 border-b border-[color:var(--border)]">
                                        <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                                            <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                            <span className="text-xs font-bold text-[color:var(--foreground)] truncate" title={leadingItem.name}>
                                                {leadingItem.name}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => deleteSelectedCanvasItem(leadingItem.id)}
                                            className="text-xs text-red-500 hover:text-red-600 hover:underline flex items-center gap-1 font-medium"
                                        >
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    </div>

                                    {/* Page Allocation */}
                                    <div className="space-y-1">
                                        <label className="block text-[10px] text-[color:var(--muted)] font-bold uppercase tracking-wider">Target Canvas Page</label>
                                        <select
                                            value={leadingItem.pageIndex}
                                            onChange={(e) => {
                                                const nextP = Number(e.target.value);
                                                updateSelectedItemsFields(() => ({ pageIndex: nextP }));
                                                pushToHistory(canvasItems);
                                            }}
                                            className="w-full bg-[color:var(--background)] border border-[color:var(--border)] rounded-lg text-xs p-2 text-[color:var(--foreground)] font-medium"
                                        >
                                            {Array.from({ length: customPagesCount }).map((_, p) => (
                                                <option key={p} value={p}>Page #{p + 1}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Position (X, Y) */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="block text-[10px] text-[color:var(--muted)] font-bold uppercase tracking-wider">X Position</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={canvasWidth - leadingItem.width}
                                                value={leadingItem.x}
                                                onChange={(e) => {
                                                    const val = Math.max(0, Math.min(canvasWidth - leadingItem.width, Number(e.target.value)));
                                                    updateSelectedItemsFields(() => ({ x: val }));
                                                }}
                                                onBlur={() => pushToHistory(canvasItems)}
                                                className="w-full bg-[color:var(--background)] border border-[color:var(--border)] rounded-lg text-xs p-2 text-[color:var(--foreground)] font-mono"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-[10px] text-[color:var(--muted)] font-bold uppercase tracking-wider">Y Position</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={canvasHeight - leadingItem.height}
                                                value={leadingItem.y}
                                                onChange={(e) => {
                                                    const val = Math.max(0, Math.min(canvasHeight - leadingItem.height, Number(e.target.value)));
                                                    updateSelectedItemsFields(() => ({ y: val }));
                                                }}
                                                onBlur={() => pushToHistory(canvasItems)}
                                                className="w-full bg-[color:var(--background)] border border-[color:var(--border)] rounded-lg text-xs p-2 text-[color:var(--foreground)] font-mono"
                                            />
                                        </div>
                                    </div>

                                    {/* Dimensions (Width, Height) */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-[color:var(--muted)] font-semibold">
                                            <span className="uppercase tracking-wider font-bold">Dimensions (Width × Height)</span>
                                            <span className="font-mono text-indigo-500 font-bold">{leadingItem.width} × {leadingItem.height}px</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="40"
                                            max={canvasWidth}
                                            value={leadingItem.width}
                                            onChange={(e) => {
                                                const targetW = Number(e.target.value);
                                                const ratioDelta = targetW / leadingItem.width;
                                                updateSelectedItemsFields((item) => {
                                                    const nextW = Math.max(40, Math.min(canvasWidth - item.x, Math.round(item.width * ratioDelta)));
                                                    return {
                                                        width: nextW,
                                                        height: Math.round(nextW / item.aspectRatio),
                                                    };
                                                });
                                            }}
                                            onMouseUp={() => pushToHistory(canvasItems)}
                                            className="w-full accent-indigo-500 h-1.5 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    {/* Border Thickness & Color */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-[color:var(--muted)] font-semibold">
                                            <span className="uppercase tracking-wider font-bold">Border Thickness</span>
                                            <span className="font-mono">{leadingItem.borderWidth}px</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="range"
                                                min="0"
                                                max="12"
                                                value={leadingItem.borderWidth}
                                                onChange={(e) => updateSelectedItemsFields(() => ({ borderWidth: Number(e.target.value) }))}
                                                onMouseUp={() => pushToHistory(canvasItems)}
                                                className="flex-1 accent-indigo-500 h-1.5 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                            />
                                            <input
                                                type="color"
                                                value={leadingItem.borderColor || "#000000"}
                                                onChange={(e) => updateSelectedItemsFields(() => ({ borderColor: e.target.value }))}
                                                onBlur={() => pushToHistory(canvasItems)}
                                                className="w-7 h-7 p-0.5 rounded border border-[color:var(--border)] bg-[color:var(--background)] cursor-pointer"
                                                title="Border Color"
                                            />
                                        </div>
                                    </div>

                                    {/* Z-Index Layer */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-[color:var(--muted)] font-semibold">
                                            <span className="uppercase tracking-wider font-bold">Layer (Z-Index)</span>
                                            <span className="font-mono text-purple-500 font-bold">{leadingItem.zIndex}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max={canvasItems.length + 5}
                                            value={leadingItem.zIndex}
                                            onChange={(e) => {
                                                const baseVal = Number(e.target.value);
                                                updateSelectedItemsFields(() => ({ zIndex: baseVal }));
                                            }}
                                            onMouseUp={() => pushToHistory(canvasItems)}
                                            className="w-full accent-purple-500 h-1.5 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-[color:var(--border)] p-6 text-center text-xs text-[color:var(--muted)] space-y-2">
                                    <Move size={20} className="mx-auto text-[color:var(--muted)] opacity-60" />
                                    <p className="font-medium">No object selected</p>
                                    <p className="text-[10px] opacity-75">Click on any image on the canvas to inspect and edit its size, position, border, and layer order.</p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 pt-4 border-t border-[color:var(--border)]">
                            <ProcessingModeSelector
                                mode={processingMode}
                                onChange={setProcessingMode}
                                disabled={isProcessing}
                            />

                            <PdfActionButton
                                text={`Compile ${images.length} Image${images.length > 1 ? "s" : ""} into PDF`}
                                loadingText="Compiling Custom PDF..."
                                loading={isProcessing}
                                disabled={isProcessing || images.length === 0}
                                onClick={handleCompilePdf}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* PREMIUM UPGRADE OVERLAY AD MODAL */}
            {showUpgradeAd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl p-8 shadow-2xl text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
                        <button
                            type="button"
                            onClick={() => setShowUpgradeAd(false)}
                            className="absolute top-4 right-4 p-2 text-[color:var(--muted)] hover:text-[color:var(--foreground)] rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            <span className="text-sm font-bold">✕</span>
                        </button>

                        <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-5 shadow-sm border border-amber-500/10">
                            <Sparkles size={26} />
                        </div>

                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-3">
                            Premium Workspace Feature
                        </span>

                        <h3 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight leading-snug">
                            Unlock Custom Canvas
                        </h3>

                        <p className="mt-3 text-xs leading-relaxed text-[color:var(--muted)] font-medium px-2">
                            Multi-page visual layouts, interactive scaling, layering orders, and custom borders are available with Pro tier.
                        </p>

                        <div className="mt-6 flex flex-col gap-2 w-full">
                            <Link
                                href="/subscribe"
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 text-xs font-bold text-white shadow-md shadow-amber-600/10 hover:opacity-95 transition-all"
                            >
                                Upgrade to Pro Tier
                            </Link>
                            <button
                                type="button"
                                onClick={() => setShowUpgradeAd(false)}
                                className="w-full px-5 py-3 border border-[color:var(--border)] hover:bg-[var(--background)] text-xs font-bold rounded-xl text-[color:var(--foreground)] transition-all"
                            >
                                Continue with Standard Stack
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LOGIN AD MODAL */}
            {showLoginAd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl p-8 shadow-2xl text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
                        <button
                            type="button"
                            onClick={() => setShowLoginAd(false)}
                            className="absolute top-4 right-4 p-2 text-[color:var(--muted)] hover:text-[color:var(--foreground)] rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            <span className="text-sm font-bold">✕</span>
                        </button>

                        <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-5 shadow-sm border border-amber-500/10">
                            <Sparkles size={26} />
                        </div>

                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-3">
                            Account Required
                        </span>

                        <h3 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight leading-snug">
                            Sign in to Customize
                        </h3>

                        <p className="mt-3 text-xs leading-relaxed text-[color:var(--muted)] font-medium px-2">
                            Create a free account to unlock your personal workspace, save usage history, and upgrade to Pro whenever needed.
                        </p>

                        <div className="mt-6 flex flex-col gap-2 w-full">
                            <Link
                                href="/register"
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 text-xs font-bold text-white shadow-md shadow-amber-600/10 hover:opacity-95 transition-all"
                            >
                                Create Free Account
                            </Link>
                            <Link
                                href="/login"
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] px-5 py-3 text-xs font-bold hover:bg-[var(--background)] transition-all"
                            >
                                Already have an account? Sign in
                            </Link>
                            <button
                                type="button"
                                onClick={() => setShowLoginAd(false)}
                                className="w-full px-5 py-3 border border-[color:var(--border)] hover:bg-[var(--background)] text-xs font-bold rounded-xl text-[color:var(--foreground)] transition-all"
                            >
                                Continue with Standard Stack
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}