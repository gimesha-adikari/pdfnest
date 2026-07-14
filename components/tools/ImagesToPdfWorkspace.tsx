"use client";

import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {
    Image as ImageIcon,
    Layers,
    LayoutGrid,
    Move,
    PlusCircle,
    Redo2,
    ShieldCheck,
    SlidersHorizontal,
    Trash2,
    Undo2
} from "lucide-react";
import {uploadAndDownloadFile} from "@/lib/api";
import {handleClientError} from "@/lib/errorHandler";
import {useAuth} from "@/context/AuthContext";
import {useSharedTool} from "@/app/(site)/[toolId]/layout";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfToolHero from "@/components/pdf/PdfToolHero";
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
    "move"
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

export default function ImagesToPdfWorkspace() {
    const {requireAuth, subscription, isAuthenticated} = useAuth();
    const router = useRouter();
    const {toolId, file, setFile, setDownloadData} = useSharedTool();

    const [images, setImages] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

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
                                pageIndex: 0
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
                                pageIndex: 0
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
                updatedSelection = selectedItemIds.filter(id => id !== item.id);
            } else {
                updatedSelection.push(item.id);
            }
        } else {
            if (!selectedItemIds.includes(item.id)) {
                updatedSelection = [item.id];
            }
        }
        setSelectedItemIds(updatedSelection);

        const targets = canvasItems.filter(i => updatedSelection.includes(i.id));
        const itemsStartPositions = targets.map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            width: t.width,
            height: t.height
        }));

        setInteraction({
            itemId: item.id,
            mode,
            startX: e.clientX,
            startY: e.clientY,
            itemsStartPositions
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleInteractionMove = (e: React.PointerEvent) => {
        if (!interaction) return;

        const dx = e.clientX - interaction.startX;
        const dy = e.clientY - interaction.startY;

        setCanvasItems(prevItems => {
            return prevItems.map(item => {
                const matchStart = interaction.itemsStartPositions.find(p => p.id === item.id);
                if (!matchStart) return item;

                // eslint-disable-next-line prefer-const
                let {x, y, width, height, aspectRatio} = item;
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
                    height: Math.round(height)
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
                            x: padding + (index * 20),
                            y: padding + (index * 20),
                            width: 150,
                            height: Math.round(150 / aspect),
                            borderWidth: 0,
                            borderColor: "#000000",
                            zIndex: globalIndex + 1,
                            aspectRatio: aspect,
                            pageIndex: 0
                        });
                    };
                    htmlImg.src = url;
                });
            })
        );

        setCanvasItems(prev => {
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

        setCanvasItems(prevItems => {
            const filteredAndReindexed = prevItems
                .filter(item => item.fileIndex !== indexToRemove)
                .map(item => {
                    if (item.fileIndex > indexToRemove) {
                        return {...item, fileIndex: item.fileIndex - 1};
                    }
                    return item;
                });
            pushToHistory(filteredAndReindexed);
            return filteredAndReindexed;
        });
    };

    const deleteSelectedCanvasItem = (itemIdToDelete: string) => {
        const item = canvasItems.find(i => i.id === itemIdToDelete);
        if (item) {
            removeImageElement(item.fileIndex);
        }
    };

    const updateSelectedItemsFields = (fieldsCalculator: (item: CanvasItem) => Partial<CanvasItem>) => {
        const nextState = canvasItems.map(item => {
            if (selectedItemIds.includes(item.id)) {
                return {...item, ...fieldsCalculator(item)};
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

                const formData = new FormData();
                images.forEach((img) => {
                    formData.append("images", img);
                });

                let targetEndpoint = "/api/conversion/to-pdf";

                if (activeTab === "custom" && isPro) {
                    targetEndpoint = "/api/conversion/custom-to-pdf";

                    const activePageIndices = Array.from(new Set(canvasItems.map(item => item.pageIndex))).sort((a, b) => a - b);

                    const optimizedLayout = canvasItems
                        .filter(item => activePageIndices.includes(item.pageIndex))
                        .map(item => {
                            const finalPageIndex = activePageIndices.indexOf(item.pageIndex);
                            return {
                                ...item,
                                pageIndex: finalPageIndex,
                                x: (item.x / canvasWidth) * 350,
                                y: (item.y / canvasHeight) * 495,
                                width: (item.width / canvasWidth) * 350,
                                height: (item.height / canvasHeight) * 495
                            };
                        });

                    formData.append("canvasLayout", JSON.stringify(optimizedLayout));
                }

                const responseBlob = await uploadAndDownloadFile(targetEndpoint, formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: activeTab === "custom" ? "custom-layout-compiled.pdf" : "compiled-images.pdf"
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

    const leadingItem = canvasItems.find(i => selectedItemIds.includes(i.id)) || null;

    const handleAddNewPage = () => {
        setCustomPagesCount(prev => prev + 1);
    };

    return (
        <>
            <PdfToolHero
                title="Convert Images to PDF"
                description="Package multiple high-resolution graphics, photos, or documents into a single optimized vector PDF container."
            />

            <div
                className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">

                <div className="flex border-b border-[color:var(--border)] mb-8 gap-2 items-center justify-between">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab("standard")}
                            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
                                activeTab === "standard"
                                    ? "border-indigo-500 text-indigo-500"
                                    : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                            }`}
                        >
                            <LayoutGrid size={16}/> Standard Matrix Stack
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!isAuthenticated) {
                                    setShowLoginAd(true);
                                    return;
                                }

                                if (!isPro) {
                                    setShowUpgradeAd(true);
                                    return;
                                }
                                setActiveTab("custom");
                            }}
                            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition relative ${
                                activeTab === "custom"
                                    ? "border-purple-500 text-purple-500"
                                    : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                            } ${!isPro ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                            <Layers size={16}/> Interactive Custom Canvas
                            {!isPro && (
                                <span
                                    className="ml-1.5 text-[9px] font-black bg-amber-500/20 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                    Pro
                                </span>
                            )}
                        </button>
                    </div>

                    {activeTab === "custom" && isPro && (
                        <div className="flex items-center gap-3 pb-2">
                            <button
                                type="button"
                                onClick={handleAddNewPage}
                                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm transition"
                            >
                                <PlusCircle size={14}/> Add New Page
                            </button>
                            <div className="flex items-center gap-1.5 border-l pl-3 border-[color:var(--border)]">
                                <button
                                    type="button"
                                    onClick={handleUndo}
                                    disabled={historyIndex <= 0}
                                    title="Undo (Ctrl+Z)"
                                    className="p-1.5 bg-[color:var(--background)] border border-[color:var(--border)] rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-[color:var(--foreground)]"
                                >
                                    <Undo2 size={15}/>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRedo}
                                    disabled={historyIndex >= history.length - 1}
                                    title="Redo (Ctrl+Y)"
                                    className="p-1.5 bg-[color:var(--background)] border border-[color:var(--border)] rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-[color:var(--foreground)]"
                                >
                                    <Redo2 size={15}/>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <PdfUploader
                    onFilesAccepted={handleFilesSelection}
                    title="Upload Additional Graphic Attachments"
                    description="Drop PNG, JPEG, or WebP images here to package them into sequence matrices"
                    multiple={true}
                    accept="image/*"
                />

                {images.length > 0 && (
                    <div className="mt-8 space-y-6">

                        {activeTab === "standard" && (
                            <>
                                <div
                                    className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-2">
                                    <h3 className="text-sm font-bold flex items-center gap-2 text-[color:var(--foreground)]">
                                        <ImageIcon size={16} className="text-indigo-500"/> Compiled Queue
                                        ({images.length})
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImages([]);
                                            setCanvasItems([]);
                                            setFile(null);
                                            router.push(`/${toolId}`);
                                        }}
                                        className="text-xs text-red-500 hover:underline font-medium"
                                    >
                                        Clear All
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                    {images.map((img, index) => {
                                        const localPreviewUrl = URL.createObjectURL(img);
                                        return (
                                            <div key={`${img.name}-${index}`}
                                                 className="group relative border border-[color:var(--border)] rounded-xl overflow-hidden aspect-square bg-[color:var(--background)] shadow-sm">
                                                <img src={localPreviewUrl} alt={img.name}
                                                     className="w-full h-full object-cover"
                                                     onLoad={() => URL.revokeObjectURL(localPreviewUrl)}/>
                                                <button type="button" onClick={() => removeImageElement(index)}
                                                        className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full p-1 text-xs opacity-0 group-hover:opacity-100 transition shadow-md">✕
                                                </button>
                                                <div
                                                    className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] text-white truncate">{img.name}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {activeTab === "custom" && isPro && (
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[600px]">
                                <div
                                    onClick={() => setSelectedItemIds([])}
                                    className="lg:col-span-3 border border-[color:var(--border)] rounded-2xl p-8 overflow-auto flex flex-col gap-8 items-center max-h-[850px] shadow-inner bg-neutral-900/10 dark:bg-black/40"
                                >
                                    {Array.from({length: customPagesCount}).map((_, pageIdx) => {
                                        const itemsOnThisPage = canvasItems.filter(item => item.pageIndex === pageIdx);

                                        return (
                                            <div key={`page-${pageIdx}`}
                                                 className="flex flex-col items-center gap-2 shrink-0">
                                                <div
                                                    className="w-full flex items-center justify-between text-xs font-bold text-[color:var(--muted)] px-1">
                                                    <span>Page {pageIdx + 1}</span>
                                                    {itemsOnThisPage.length === 0 && (
                                                        <span
                                                            className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-medium">Empty (Will be skipped on export)</span>
                                                    )}
                                                </div>
                                                <div
                                                    ref={el => {
                                                        canvasRefs.current[pageIdx] = el;
                                                    }}
                                                    style={{width: `${canvasWidth}px`, height: `${canvasHeight}px`}}
                                                    className="bg-white border border-neutral-300 shadow-2xl relative rounded-sm overflow-hidden select-none"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div
                                                        className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:20px_20px]"/>

                                                    {itemsOnThisPage.map((item) => {
                                                        const fileRef = images[item.fileIndex];
                                                        if (!fileRef) return null;
                                                        const imgUrl = URL.createObjectURL(fileRef);
                                                        const isSelected = selectedItemIds.includes(item.id);

                                                        return (
                                                            <div
                                                                key={item.id}
                                                                onPointerMove={handleInteractionMove}
                                                                onPointerUp={handleInteractionEnd}
                                                                style={{
                                                                    position: "absolute",
                                                                    left: `${item.x}px`,
                                                                    top: `${item.y}px`,
                                                                    width: `${item.width}px`,
                                                                    height: `${item.height}px`,
                                                                    border: `${item.borderWidth}px solid ${item.borderColor}`,
                                                                    zIndex: item.zIndex,
                                                                    touchAction: "none"
                                                                }}
                                                                className={`absolute transition-[border-color] group rounded-sm ${
                                                                    isSelected ? "ring-2 ring-indigo-500 shadow-2xl bg-indigo-500/5" : "hover:ring-1 hover:ring-purple-400"
                                                                }`}
                                                            >
                                                                <img src={imgUrl} alt={item.name}
                                                                     className="w-full h-full object-cover pointer-events-none"
                                                                     onLoad={() => URL.revokeObjectURL(imgUrl)}/>

                                                                <button
                                                                    type="button"
                                                                    title="Delete image item"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        deleteSelectedCanvasItem(item.id);
                                                                    }}
                                                                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition z-[60] shadow-md hover:bg-red-600 active:scale-95"
                                                                >
                                                                    <Trash2 size={11}/>
                                                                </button>

                                                                <div
                                                                    onPointerDown={(e) => handleInteractionStart(e, item, "move")}
                                                                    className="absolute inset-0 flex items-center justify-center bg-black/0 active:bg-black/10 group-hover:bg-black/5 transition cursor-move"
                                                                >
                                                                    <Move
                                                                        className="text-white opacity-0 group-hover:opacity-40 drop-shadow-md transition"
                                                                        size={20}/>
                                                                </div>

                                                                {isSelected && (
                                                                    <>
                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-nw")}
                                                                            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nwse-resize z-50 shadow"/>
                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-ne")}
                                                                            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nesw-resize z-50 shadow"/>
                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-se")}
                                                                            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nwse-resize z-50 shadow"/>
                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-sw")}
                                                                            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nesw-resize z-50 shadow"/>

                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-n")}
                                                                            className="absolute -top-1 inset-x-4 h-1 bg-indigo-500/40 hover:bg-indigo-600 cursor-ns-resize z-40 transition"/>
                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-s")}
                                                                            className="absolute -bottom-1 inset-x-4 h-1 bg-indigo-500/40 hover:bg-indigo-600 cursor-ns-resize z-40 transition"/>
                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-e")}
                                                                            className="absolute -right-1 inset-y-4 w-1 bg-indigo-500/40 hover:bg-indigo-600 cursor-ew-resize z-40 transition"/>
                                                                        <div
                                                                            onPointerDown={(e) => handleInteractionStart(e, item, "resize-w")}
                                                                            className="absolute -left-1 inset-y-4 w-1 bg-indigo-500/40 hover:bg-indigo-600 cursor-ew-resize z-40 transition"/>
                                                                    </>
                                                                )}

                                                                <div
                                                                    className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white p-0.5 opacity-0 group-hover:opacity-100 truncate pointer-events-none">
                                                                    Priority: {item.zIndex}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div
                                    className="border border-[color:var(--border)] rounded-2xl p-5 bg-[var(--card)]/50 space-y-6">
                                    <h4 className="text-xs font-black tracking-wider uppercase flex items-center gap-2 text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-2">
                                        <SlidersHorizontal size={14} className="text-purple-500"/> Workspace Options
                                    </h4>

                                    {leadingItem ? (
                                        <div className="space-y-4 text-xs">
                                            <div
                                                className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] pb-2">
                                                <p className="font-bold truncate text-indigo-500 max-w-[70%]">
                                                    {selectedItemIds.length > 1 ? `Selected Group (${selectedItemIds.length} nodes)` : leadingItem.name}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteSelectedCanvasItem(leadingItem.id)}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-600 transition bg-red-500/10 hover:bg-red-500/20 px-2 py-1 rounded-md"
                                                >
                                                    <Trash2 size={11}/> Delete
                                                </button>
                                            </div>

                                            <div className="space-y-1">
                                                <label
                                                    className="block text-[10px] text-[color:var(--muted-foreground)] font-semibold mb-1">Assigned
                                                    Page Workspace</label>
                                                <select
                                                    value={leadingItem.pageIndex}
                                                    onChange={(e) => {
                                                        const targetPage = Number(e.target.value);
                                                        updateSelectedItemsFields(() => ({pageIndex: targetPage}));
                                                        pushToHistory(canvasItems);
                                                    }}
                                                    className="w-full bg-[color:var(--background)] text-xs border border-[color:var(--border)] rounded-lg p-2 font-medium focus:ring-1 focus:ring-indigo-500 outline-none text-[color:var(--foreground)]"
                                                >
                                                    {Array.from({length: customPagesCount}).map((_, idx) => (
                                                        <option key={`opt-${idx}`} value={idx}>Page Layout
                                                            Sheet {idx + 1}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-1">
                                                <div
                                                    className="flex justify-between text-[10px] text-[color:var(--muted-foreground)] font-semibold">
                                                    <span>Horizontal Position</span>
                                                    <span>{selectedItemIds.length > 1 ? "Relative" : `${leadingItem.x}px`}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max={canvasWidth - 40}
                                                    value={leadingItem.x}
                                                    onChange={(e) => {
                                                        const targetX = Number(e.target.value);
                                                        const offset = targetX - leadingItem.x;
                                                        updateSelectedItemsFields(item => ({x: Math.max(0, Math.min(canvasWidth - item.width, item.x + offset))}));
                                                    }}
                                                    onMouseUp={() => pushToHistory(canvasItems)}
                                                    className="w-full accent-indigo-500 h-1 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div
                                                    className="flex justify-between text-[10px] text-[color:var(--muted-foreground)] font-semibold">
                                                    <span>Vertical Position</span>
                                                    <span>{selectedItemIds.length > 1 ? "Relative" : `${leadingItem.y}px`}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max={canvasHeight - 40}
                                                    value={leadingItem.y}
                                                    onChange={(e) => {
                                                        const targetY = Number(e.target.value);
                                                        const offset = targetY - leadingItem.y;
                                                        updateSelectedItemsFields(item => ({y: Math.max(0, Math.min(canvasHeight - item.height, item.y + offset))}));
                                                    }}
                                                    onMouseUp={() => pushToHistory(canvasItems)}
                                                    className="w-full accent-indigo-500 h-1 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div
                                                    className="flex justify-between text-[10px] text-[color:var(--muted-foreground)] font-semibold">
                                                    <span>Scale (Width)</span>
                                                    <span>{selectedItemIds.length > 1 ? "Multiple" : `${leadingItem.width}px`}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="40"
                                                    max={canvasWidth}
                                                    value={leadingItem.width}
                                                    onChange={(e) => {
                                                        const targetW = Number(e.target.value);
                                                        const ratioDelta = targetW / leadingItem.width;
                                                        updateSelectedItemsFields(item => {
                                                            const nextW = Math.max(40, Math.min(canvasWidth - item.x, Math.round(item.width * ratioDelta)));
                                                            return {
                                                                width: nextW,
                                                                height: Math.round(nextW / item.aspectRatio)
                                                            };
                                                        });
                                                    }}
                                                    onMouseUp={() => pushToHistory(canvasItems)}
                                                    className="w-full accent-indigo-500 h-1 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div
                                                    className="flex justify-between text-[10px] text-[color:var(--muted-foreground)] font-semibold">
                                                    <span>Border Thickness</span>
                                                    <span>{leadingItem.borderWidth}px</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="12"
                                                    value={leadingItem.borderWidth}
                                                    onChange={(e) => updateSelectedItemsFields(() => ({borderWidth: Number(e.target.value)}))}
                                                    onMouseUp={() => pushToHistory(canvasItems)}
                                                    className="w-full accent-indigo-500 h-1 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div
                                                    className="flex justify-between text-[10px] text-[color:var(--muted-foreground)] font-semibold">
                                                    <span>Layer Order (Z-Index)</span>
                                                    <span>{leadingItem.zIndex}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max={canvasItems.length + 5}
                                                    value={leadingItem.zIndex}
                                                    onChange={(e) => {
                                                        const baseVal = Number(e.target.value);
                                                        let offset = 0;
                                                        updateSelectedItemsFields(() => {
                                                            const currentOffset = offset;
                                                            offset += 1;
                                                            return {zIndex: baseVal + currentOffset};
                                                        });
                                                    }}
                                                    onMouseUp={() => pushToHistory(canvasItems)}
                                                    className="w-full accent-purple-500 h-1 bg-[color:var(--border)] rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>

                                            <div className="pt-2">
                                                <label
                                                    className="block text-[10px] text-[color:var(--muted)] mb-1 font-bold">Border
                                                    Hue</label>
                                                <input
                                                    type="color"
                                                    value={leadingItem.borderColor}
                                                    onChange={(e) => updateSelectedItemsFields(() => ({borderColor: e.target.value}))}
                                                    onBlur={() => pushToHistory(canvasItems)}
                                                    className="h-8 w-full rounded-xl bg-transparent cursor-pointer border border-[color:var(--border)]"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-[color:var(--muted)] italic text-center py-8">Select
                                            one or more image nodes on the canvas to display real-time touch
                                            adjustments.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {success && (
                            <div
                                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16}/>
                                <div className="text-xs">
                                    <p className="font-semibold">Document Conversion Finished!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">Your image
                                        package has been transformed into a fully organized PDF download stream.</p>
                                </div>
                            </div>
                        )}

                        <div className="w-full pt-4">
                            <PdfActionButton
                                text={`Compile ${images.length} Image${images.length > 1 ? "s" : ""} into PDF`}
                                loadingText="Processing Image Matrix Conversion..."
                                loading={isProcessing}
                                disabled={images.length === 0}
                                onClick={handleCompilePdf}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* PREMIUM UPGRADE OVERLAY AD MODAL */}
            {showUpgradeAd && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div
                        className="relative w-full max-w-md bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl p-8 shadow-2xl text-center flex flex-col items-center animate-in zoom-in-95 duration-200">

                        {/* Close Button */}
                        <button
                            type="button"
                            onClick={() => setShowUpgradeAd(false)}
                            className="absolute top-4 right-4 p-2 text-[color:var(--muted)] hover:text-[color:var(--foreground)] rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            <span className="text-sm font-bold">✕</span>
                        </button>

                        <div
                            className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-5 shadow-sm border border-amber-500/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round" className="animate-pulse">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                        </div>

                        <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-3">
                            Premium Workspace Feature
                        </span>

                        <h3 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight leading-snug">
                            Unlock Interactive <br/> Custom Canvas
                        </h3>

                        <p className="mt-3 text-xs leading-relaxed text-[color:var(--muted)] font-medium px-2">
                            Multi-page vector scaling transformations, layer orders (Z-index properties), border
                            customizations, and matrix positioning configurations are restricted to Pro tier accounts.
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

            {showLoginAd && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div
                        className="relative w-full max-w-md bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl p-8 shadow-2xl text-center flex flex-col items-center animate-in zoom-in-95 duration-200">

                        <button
                            type="button"
                            onClick={() => setShowLoginAd(false)}
                            className="absolute top-4 right-4 p-2 text-[color:var(--muted)] hover:text-[color:var(--foreground)] rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            <span className="text-sm font-bold">✕</span>
                        </button>

                        <div
                            className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-5 shadow-sm border border-amber-500/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round" className="animate-pulse">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                        </div>

                        <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-3">
                            Premium Workspace Feature
                        </span>

                        <h3 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight leading-snug">
                            Unlock Interactive <br/> Custom Canvas
                        </h3>

                        <p className="mt-3 text-xs leading-relaxed text-[color:var(--muted)] font-medium px-2">
                            Multi-page vector scaling transformations, layer orders (Z-index properties), border
                            customizations, and matrix positioning configurations are restricted to Pro tier accounts.
                        </p>

                        <div className="mt-6 flex flex-col gap-2 w-full">
                            <Link
                                href="/login"
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 text-xs font-bold text-white shadow-md shadow-amber-600/10 hover:opacity-95 transition-all"
                            >
                                Login to Pro Account
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
        </>
    );
}