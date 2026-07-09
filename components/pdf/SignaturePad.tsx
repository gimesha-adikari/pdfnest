"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
    Eraser,
    Undo2,
    Palette,
    PenTool,
    Upload,
    Image as ImageIcon,
    X,
} from "lucide-react";

interface SignaturePadProps {
    onSignatureChange: (blob: Blob | null) => void;
}

type Mode = "draw" | "upload";

const DEFAULT_COLORS = [
    "#000000",
    "#1d4ed8",
    "#7c3aed",
    "#b91c1c",
    "#047857",
];

export default function SignaturePad({ onSignatureChange }: SignaturePadProps) {
    const sigRef = useRef<SignatureCanvas | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [mode, setMode] = useState<Mode>("draw");
    const [isEmpty, setIsEmpty] = useState(true);
    const [strokeWidth, setStrokeWidth] = useState(2.5);
    const [penColor, setPenColor] = useState("#000000");

    const [uploadedBlob, setUploadedBlob] = useState<Blob | null>(null);
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

    const clearUploadedImage = useCallback(() => {
        if (uploadedUrl) {
            URL.revokeObjectURL(uploadedUrl);
        }
        setUploadedUrl(null);
        setUploadedBlob(null);
        onSignatureChange(null);
    }, [onSignatureChange, uploadedUrl]);

    const syncDrawnSignature = useCallback(() => {
        const pad = sigRef.current as any;
        if (!pad || pad.isEmpty()) {
            setIsEmpty(true);
            onSignatureChange(null);
            return;
        }

        setIsEmpty(false);

        const trimmedCanvas = pad.getTrimmedCanvas?.() ?? pad.getCanvas?.();
        if (!trimmedCanvas) {
            onSignatureChange(null);
            return;
        }

        trimmedCanvas.toBlob((blob: Blob | null) => {
            onSignatureChange(blob);
        }, "image/png");
    }, [onSignatureChange]);

    const resizeCanvas = useCallback(() => {
        const pad = sigRef.current as any;
        const canvas = pad?.getCanvas?.() as HTMLCanvasElement | undefined;
        const wrapper = wrapperRef.current;

        if (!canvas || !wrapper) return;

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const width = wrapper.clientWidth || 400;
        const height = 160;

        const existingData = pad.toData?.() ?? [];
        const hadInk = !pad.isEmpty?.();

        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        }

        pad.clear?.();

        if (hadInk && existingData.length > 0) {
            pad.fromData?.(existingData);
            setIsEmpty(false);
        } else {
            setIsEmpty(true);
        }
    }, []);

    useEffect(() => {
        resizeCanvas();

        const onResize = () => resizeCanvas();
        window.addEventListener("resize", onResize);

        return () => {
            window.removeEventListener("resize", onResize);
        };
    }, [resizeCanvas]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (mode !== "draw") return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                handleUndo();
                return;
            }

            if (e.key === "Delete" || e.key === "Backspace") {
                const target = e.target as HTMLElement | null;
                const isTypingField =
                    target?.tagName === "INPUT" ||
                    target?.tagName === "TEXTAREA" ||
                    target?.tagName === "SELECT" ||
                    target?.isContentEditable;

                if (!isTypingField) {
                    e.preventDefault();
                    clearDrawnSignature();
                }
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const clearDrawnSignature = useCallback(() => {
        const pad = sigRef.current as any;
        pad?.clear?.();
        setIsEmpty(true);
        onSignatureChange(null);
    }, [onSignatureChange]);

    const handleUndo = useCallback(() => {
        const pad = sigRef.current as any;
        if (!pad) return;

        const data = pad.toData?.() ?? [];
        if (!data.length) {
            setIsEmpty(true);
            onSignatureChange(null);
            return;
        }

        data.pop();
        pad.clear?.();
        if (data.length > 0) {
            pad.fromData?.(data);
            setIsEmpty(false);
            syncDrawnSignature();
        } else {
            setIsEmpty(true);
            onSignatureChange(null);
        }
    }, [onSignatureChange, syncDrawnSignature]);

    const handleDrawEnd = () => {
        syncDrawnSignature();
    };

    const handleUploadImage = (file: File | null) => {
        if (!file) {
            clearUploadedImage();
            return;
        }

        if (uploadedUrl) {
            URL.revokeObjectURL(uploadedUrl);
        }

        const nextUrl = URL.createObjectURL(file);
        setUploadedUrl(nextUrl);
        setUploadedBlob(file);
        setMode("upload");
        onSignatureChange(file);
    };

    const handleClearAll = () => {
        clearDrawnSignature();
        clearUploadedImage();
        const pad = sigRef.current as any;
        pad?.clear?.();
        setIsEmpty(true);
    };

    const canUseDrawnSignature = mode === "draw" && !isEmpty;
    const canUseUploadedSignature = mode === "upload" && !!uploadedBlob;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-1">
                <button
                    type="button"
                    onClick={() => setMode("draw")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        mode === "draw"
                            ? "bg-[var(--card)] text-indigo-600 shadow-sm"
                            : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <PenTool size={14} />
                    Draw
                </button>
                <button
                    type="button"
                    onClick={() => setMode("upload")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        mode === "upload"
                            ? "bg-[var(--card)] text-indigo-600 shadow-sm"
                            : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <ImageIcon size={14} />
                    Upload
                </button>
            </div>

            {mode === "draw" ? (
                <>
                    <div className="space-y-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                                <Palette size={14} />
                                Pen Color
                            </div>

                            <div className="flex items-center gap-1.5">
                                {DEFAULT_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setPenColor(color)}
                                        className={`h-6 w-6 rounded-full border transition ${
                                            penColor === color
                                                ? "scale-110 border-[color:var(--foreground)]"
                                                : "border-[color:var(--border)]"
                                        }`}
                                        style={{ backgroundColor: color }}
                                        aria-label={`Choose ${color}`}
                                    />
                                ))}
                                <label className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]">
                                    <input
                                        type="color"
                                        value={penColor}
                                        onChange={(e) => setPenColor(e.target.value)}
                                        className="sr-only"
                                    />
                                    <Palette size={12} />
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                                <span>Stroke width</span>
                                <span>{strokeWidth.toFixed(1)} px</span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={8}
                                step={0.5}
                                value={strokeWidth}
                                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                                className="w-full accent-indigo-600"
                            />
                        </div>
                    </div>

                    <div
                        ref={wrapperRef}
                        className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[color:var(--border)] bg-white"
                    >
                        {isEmpty && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-[color:var(--muted)]">
                                Draw your signature here
                            </div>
                        )}

                        <SignatureCanvas
                            ref={sigRef}
                            penColor={penColor}
                            minWidth={Math.max(0.8, strokeWidth * 0.5)}
                            maxWidth={Math.max(1.5, strokeWidth)}
                            velocityFilterWeight={0.7}
                            onEnd={handleDrawEnd}
                            canvasProps={{
                                className:
                                    "block h-[160px] w-full cursor-crosshair touch-none select-none",
                            }}
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleUndo}
                            disabled={!canUseDrawnSignature}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--background)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Undo2 size={14} />
                            Undo
                        </button>

                        <button
                            type="button"
                            onClick={clearDrawnSignature}
                            disabled={isEmpty}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Eraser size={14} />
                            Clear
                        </button>
                    </div>

                    {!isEmpty && (
                        <p className="text-xs text-[color:var(--muted)]">
                            Ctrl+Z undo, Delete clears the drawing.
                        </p>
                    )}
                </>
            ) : (
                <div className="space-y-3">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                    Upload signature image
                                </p>
                                <p className="mt-1 text-xs text-[color:var(--muted)]">
                                    PNG, JPG, or WEBP works best.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
                            >
                                <Upload size={14} />
                                Choose file
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                className="hidden"
                                onChange={(e) => handleUploadImage(e.target.files?.[0] ?? null)}
                            />
                        </div>
                    </div>

                    {uploadedUrl ? (
                        <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white p-4">
                            <img
                                src={uploadedUrl}
                                alt="Uploaded signature preview"
                                className="max-h-[180px] w-full object-contain"
                            />

                            <button
                                type="button"
                                onClick={clearUploadedImage}
                                className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-xl bg-red-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-red-600"
                            >
                                <X size={12} />
                                Remove
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-2xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--background)]/30 p-6 text-center">
                            <Upload className="mx-auto text-[color:var(--muted)]" size={24} />
                            <p className="mt-2 text-sm font-medium text-[color:var(--foreground)]">
                                No image selected
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--muted)]">
                                Pick an image file to use as a signature.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={clearUploadedImage}
                            disabled={!uploadedBlob}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Eraser size={14} />
                            Clear image
                        </button>
                    </div>

                    {canUseUploadedSignature && (
                        <p className="text-xs text-[color:var(--muted)]">
                            The selected image is ready to use.
                        </p>
                    )}
                </div>
            )}

            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3 text-xs text-[color:var(--muted)]">
                The parent component receives a PNG blob when you draw a signature, or the uploaded image file when you choose an image.
            </div>
        </div>
    );
}