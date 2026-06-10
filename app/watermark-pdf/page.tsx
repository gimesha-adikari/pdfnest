"use client";

import {useMemo, useState, useEffect, useRef} from "react";
import {
    Type,
    ShieldCheck,
    Loader2,
    FileText,
    Move,
    RotateCw,
    Sparkles,
    Image as ImageIcon,
    Trash2,
    UploadCloud,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import {uploadAndDownloadFile} from "@/lib/apiClient";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

const STYLISTIC_FONTS = [
    {id: "Helvetica", name: "Sans-Serif Modern (Helvetica)", cssClass: "font-sans font-bold"},
    {id: "Times-Roman", name: "Classic Editorial (Times Roman)", cssClass: "font-serif font-medium"},
    {id: "Courier", name: "Monospace Tech (Courier)", cssClass: "font-mono font-normal"}
];

export default function WatermarkPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");

    const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
    const [fontFamily, setFontFamily] = useState<string>("Helvetica");

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>("");

    const [fontSize, setFontSize] = useState<number>(48);
    const [rotation, setRotation] = useState<number>(45);
    const [position, setPosition] = useState<string>("cc");
    const [opacity, setOpacity] = useState<number>(0.3);

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const [pdfDocument, setPdfDocument] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState<boolean>(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        return () => {
            if (imagePreview) URL.revokeObjectURL(imagePreview);
        };
    }, [imagePreview]);

    useEffect(() => {
        if (!file) {
            setPdfDocument(null);
            setTotalPages(0);
            setCurrentPage(1);
            return;
        }

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const loadingTask = pdfjsLib.getDocument({data: typedArray});
                const pdf = await loadingTask.promise;

                setPdfDocument(pdf);
                setTotalPages(pdf.numPages);
                setCurrentPage(1);
            } catch (err) {
                console.error("Failed to parse visual document framework:", err);
            } finally {
                setIsRenderingCanvas(false);
            }
        };

        loadPdf();
    }, [file]);

    useEffect(() => {
        if (!pdfDocument || !canvasRef.current) return;

        const renderPage = async () => {
            try {
                setIsRenderingCanvas(true);
                const page = await pdfDocument.getPage(currentPage);
                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const viewport = page.getViewport({scale: 1.2});
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };
                await page.render(renderContext).promise;
            } catch (err) {
                console.error("Canvas raster generation skipped:", err);
            } finally {
                setIsRenderingCanvas(false);
            }
        };

        renderPage();
    }, [pdfDocument, currentPage]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = e.target.files[0];
            setImageFile(selected);
            if (imagePreview) URL.revokeObjectURL(imagePreview);
            setImagePreview(URL.createObjectURL(selected));
            setSuccess(false);
        }
    };

    const handleWatermarkProcessing = async () => {
        if (!file) return;
        if (watermarkType === "text" && !watermarkText.trim()) return;
        if (watermarkType === "image" && !imageFile) return;

        try {
            setIsProcessing(true);
            setSuccess(false);

            let backendPosition = position;
            if (position === "cc") backendPosition = "c";
            else if (position === "cl") backendPosition = "l";
            else if (position === "cr") backendPosition = "r";

            let normalizedScale;
            if(watermarkType=="image"){
                normalizedScale = (fontSize / 500).toFixed(2);
            }else {
                normalizedScale = (fontSize / 40).toFixed(2);
            }
            let newRotation = -rotation;
            console.log(rotation + ":" + newRotation)
            const description = `font:${fontFamily}, pos:${backendPosition}, scale:${normalizedScale}, rot:${newRotation}, op:${opacity}`;

            const formData = new FormData();
            formData.append("file", file);
            formData.append("description", description);

            if (watermarkType === "text") {
                formData.append("text", watermarkText.trim());
            } else if (watermarkType === "image" && imageFile) {
                formData.append("watermarkImage", imageFile);
            }

            await uploadAndDownloadFile(
                "/structure/watermark",
                formData,
                `${file.name.replace(/\.pdf$/i, "")}-marked.pdf`
            );

            setSuccess(true);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Watermark implementation runtime failure.");
        } finally {
            setIsProcessing(false);
        }
    };

    const fontStyleClass = useMemo(() => {
        const found = STYLISTIC_FONTS.find(f => f.id === fontFamily);
        return found ? found.cssClass : "font-sans font-bold";
    }, [fontFamily]);

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Watermark PDF Document"
                description="Embed personalized secure text stamps or custom graphic image signatures into high-fidelity PDF layouts seamlessly."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                {!file && (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center w-full p-12 border-2 border-dashed border-[color:var(--border)] rounded-2xl bg-[color:var(--background)]/30 hover:bg-[color:var(--background)]/60 hover:border-indigo-500/50 transition cursor-pointer"
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) setFile(e.target.files[0]);
                            }}
                        />
                        <UploadCloud size={40} className="text-[color:var(--muted)] mb-4"/>
                        <h3 className="text-md font-bold text-[color:var(--foreground)]">Upload Target PDF Document</h3>
                        <p className="text-xs text-[color:var(--muted)] mt-1">Click to browse or drag and drop file
                            vectors</p>
                    </div>
                )}

                {file && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-5 space-y-6">
                            <PdfFileInfo file={file}/>

                            {/* TYPE SELECTOR TOGGLE BUTTON MATRIX */}
                            <div className="space-y-2">
                                <label
                                    className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                    <Sparkles size={12}/> Watermark Structure Core Mode
                                </label>
                                <div
                                    className="grid grid-cols-2 gap-2 bg-[color:var(--background)]/50 p-1 rounded-xl border border-[color:var(--border)]">
                                    <button
                                        type="button"
                                        onClick={() => setWatermarkType("text")}
                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition ${watermarkType === "text" ? "bg-[var(--card)] text-indigo-500 shadow-sm border border-[color:var(--border)]" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
                                    >
                                        <Type size={14}/> Text Stamp
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setWatermarkType("image")}
                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition ${watermarkType === "image" ? "bg-[var(--card)] text-indigo-500 shadow-sm border border-[color:var(--border)]" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
                                    >
                                        <ImageIcon size={14}/> Image Logo
                                    </button>
                                </div>
                            </div>

                            {/* CONDITIONAL TEXT WATERMARK CONFIG */}
                            {watermarkType === "text" && (
                                <div className="space-y-4 animate-in fade-in-50 duration-150">
                                    <div className="space-y-2">
                                        <label
                                            className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                            <FileText size={12}/> Stamp Phrase Text
                                        </label>
                                        <input
                                            type="text"
                                            value={watermarkText}
                                            onChange={(e) => {
                                                setWatermarkText(e.target.value);
                                                setSuccess(false);
                                            }}
                                            className="w-full px-4 py-3 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 font-medium transition text-[color:var(--foreground)]"
                                            placeholder="e.g. CONFIDENTIAL"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label
                                            className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                            Font Typography Family
                                        </label>
                                        <select
                                            value={fontFamily}
                                            onChange={(e) => {
                                                setFontFamily(e.target.value);
                                                setSuccess(false);
                                            }}
                                            className="w-full px-4 py-3 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 text-[color:var(--foreground)] font-medium transition"
                                        >
                                            {STYLISTIC_FONTS.map(font => (
                                                <option key={font.id} value={font.id}>{font.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* CONDITIONAL IMAGE WATERMARK INJECTOR */}
                            {watermarkType === "image" && (
                                <div className="space-y-2 animate-in fade-in-50 duration-150">
                                    <label
                                        className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                        <ImageIcon size={12}/> Target Image Signature Layer
                                    </label>
                                    {!imageFile ? (
                                        <div
                                            className="relative border border-dashed border-[color:var(--border)] hover:border-indigo-500 rounded-xl p-6 bg-[color:var(--background)]/30 transition flex flex-col items-center justify-center text-center cursor-pointer">
                                            <input type="file" accept="image/png, image/jpeg, image/jpg"
                                                   onChange={handleImageChange}
                                                   className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"/>
                                            <UploadCloud size={24} className="text-[color:var(--muted)] mb-2"/>
                                            <p className="text-xs font-bold text-[color:var(--foreground)]">Select
                                                Watermark Image</p>
                                            <p className="text-[10px] text-[color:var(--muted)] mt-0.5">Supports
                                                transparent PNG, JPG signatures</p>
                                        </div>
                                    ) : (
                                        <div
                                            className="flex items-center justify-between border border-[color:var(--border)] p-3 rounded-xl bg-[color:var(--background)]/50">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <img src={imagePreview}
                                                     className="w-10 h-10 object-contain rounded bg-[color:var(--border)]/20 p-0.5 border"
                                                     alt="preview"/>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-[color:var(--foreground)] truncate font-mono">{imageFile.name}</p>
                                                    <p className="text-[10px] text-[color:var(--muted)]">{(imageFile.size / 1024).toFixed(1)} KB</p>
                                                </div>
                                            </div>
                                            <button onClick={() => {
                                                setImageFile(null);
                                                setImagePreview("");
                                            }}
                                                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-500 transition shrink-0">
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ADJUSTMENT SLIDERS */}
                            <div className="space-y-4 pt-2 border-t border-[color:var(--border)]">
                                <div className="space-y-2">
                                    <div
                                        className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                        <span>Sizing Scale Dimensions</span>
                                        <span className="font-mono text-indigo-500">{fontSize}%</span>
                                    </div>
                                    <input type="range" min="10" max="300" value={fontSize}
                                           onChange={(e) => setFontSize(Number(e.target.value))}
                                           className="w-full accent-indigo-500"/>
                                </div>

                                <div className="space-y-2">
                                    <div
                                        className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                        <span className="flex items-center gap-1"><RotateCw size={12}/> Orientation Rotation Degrees</span>
                                        <span className="font-mono text-indigo-500">{rotation}°</span>
                                    </div>
                                    <input type="range" min="-180" max="180" value={rotation}
                                           onChange={(e) => setRotation(Number(e.target.value))}
                                           className="w-full accent-indigo-500"/>
                                </div>

                                <div className="space-y-2">
                                    <div
                                        className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                        <span>Transparency Blending Opacity</span>
                                        <span className="font-mono text-indigo-500">{Math.round(opacity * 100)}%</span>
                                    </div>
                                    <input type="range" min="0.05" max="1.0" step="0.05" value={opacity}
                                           onChange={(e) => setOpacity(Number(e.target.value))}
                                           className="w-full accent-indigo-500"/>
                                </div>
                            </div>

                            {/* COORDINATES GRID CHIP BOARD BOX */}
                            <div className="space-y-2 pt-2 border-t border-[color:var(--border)]">
                                <label
                                    className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                    <Move size={12}/> Live Anchor Position Placement
                                </label>
                                <div
                                    className="grid grid-cols-3 gap-1.5 bg-[color:var(--background)]/50 p-1.5 border border-[color:var(--border)] rounded-xl max-w-[240px]">
                                    {["tl", "tc", "tr", "cl", "cc", "cr", "bl", "bc", "br"].map((pos) => (
                                        <button
                                            key={pos} type="button" onClick={() => setPosition(pos)}
                                            className={`py-1.5 text-[10px] uppercase font-bold rounded-md border text-center transition ${position === pos ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : "bg-[var(--card)] border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
                                        >
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setFile(null);
                                    setImageFile(null);
                                    setImagePreview("");
                                    setSuccess(false);
                                }}
                                className="w-full py-2.5 rounded-xl border border-[color:var(--border)] bg-[var(--card)] text-xs font-bold text-[color:var(--muted)] hover:text-[color:var(--foreground)] transition"
                            >
                                Clear Active Document context
                            </button>
                        </div>

                        {/* LIVE RENDER VISUAL PREVIEW SIDEBAR BOX PANEL */}
                        <div
                            className="lg:col-span-7 flex flex-col justify-between bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative min-h-[500px]">

                            {/* Rendering Vector Status Loader Bar Screen Overlay */}
                            {isRenderingCanvas && (
                                <div
                                    className="absolute inset-0 bg-[color:var(--background)]/40 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center text-xs font-medium text-[color:var(--muted)]">
                                    <Loader2 className="animate-spin text-indigo-500 mb-2" size={24}/>
                                    Rasterizing layout vectors...
                                </div>
                            )}

                            <div
                                className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold mb-4">
                                <span className="flex items-center gap-2"><Move size={16} className="text-indigo-500"/> Live Vector Watermark Simulator Workspace</span>
                                {totalPages > 0 && (
                                    <div
                                        className="flex items-center gap-2 border border-[color:var(--border)] px-2 py-0.5 rounded-lg bg-[var(--card)] text-xs text-[color:var(--muted)] font-mono">
                                        <button disabled={currentPage <= 1}
                                                onClick={() => setCurrentPage(prev => prev - 1)}
                                                className="hover:text-[color:var(--foreground)] disabled:opacity-20">
                                            <ChevronLeft size={14}/></button>
                                        <span>Page {currentPage} of {totalPages}</span>
                                        <button disabled={currentPage >= totalPages}
                                                onClick={() => setCurrentPage(prev => prev + 1)}
                                                className="hover:text-[color:var(--foreground)] disabled:opacity-20">
                                            <ChevronRight size={14}/></button>
                                    </div>
                                )}
                            </div>

                            {/* PREVIEW FRAME VIEWPORT CANVAS WRAPPER */}
                            <div
                                className="flex-1 w-full flex items-center justify-center bg-gray-500/5 dark:bg-black/20 rounded-xl border border-[color:var(--border)] relative overflow-hidden p-4 select-none min-h-[380px]">
                                <div
                                    className="relative shadow-xl rounded border border-gray-400/20 bg-white max-w-full">
                                    <canvas ref={canvasRef} className="max-w-full h-auto block rounded"/>

                                    {/* DYNAMIC WATERMARK ELEMENT FLOATING LAYER */}
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: position.startsWith('t') ? '1rem' : position.startsWith('b') ? 'auto' : '50%',
                                            bottom: position.startsWith('b') ? '1rem' : 'auto',
                                            left: position.endsWith('l') ? '1rem' : position.endsWith('r') ? 'auto' : '50%',
                                            right: position.endsWith('r') ? '1rem' : 'auto',
                                            transform: `translate(${position.endsWith('l') || position.endsWith('r') ? '0%' : '-50%'}, ${position.startsWith('t') || position.startsWith('b') ? '0%' : '-50%'}) rotate(${rotation}deg)`,
                                            opacity: opacity,
                                            fontSize: `${Math.max(10, fontSize * 0.4)}px`,
                                            width: watermarkType === "image" ? `${fontSize * 1.5}px` : "auto"
                                        }}
                                        className="pointer-events-none flex select-none transition-all duration-75 items-center justify-center text-center z-10"
                                    >
                                        {watermarkType === "text" ? (
                                            <span
                                                className={`whitespace-nowrap font-black text-red-500 select-none ${fontStyleClass}`}>
                                                {watermarkText || "STAMP"}
                                            </span>
                                        ) : (
                                            imagePreview ? (
                                                <img
                                                    src={imagePreview}
                                                    className="w-full h-auto object-contain select-none pointer-events-none"
                                                    alt="watermark graphics preview layer widget"
                                                />
                                            ) : (
                                                <span
                                                    className="text-[10px] uppercase font-mono font-bold tracking-widest text-indigo-500 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20 select-none">IMAGE NOT ATTACHED</span>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>

                            {success && (
                                <div
                                    className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                    <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16}/>
                                    <div className="text-xs">
                                        <p className="font-semibold">Watermark layout file compilation completed!</p>
                                        <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">The system
                                            has successfully burned your custom layout configurations into a new asset
                                            download file.</p>
                                    </div>
                                </div>
                            )}

                            <div className="w-full mt-6">
                                <PdfActionButton
                                    text="Process and Stamp Document"
                                    loadingText="Compiling Geometry Matrices on Server..."
                                    loading={isProcessing}
                                    disabled={!file || (watermarkType === "text" && !watermarkText.trim()) || (watermarkType === "image" && !imageFile)}
                                    onClick={handleWatermarkProcessing}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <PdfFeatures/>
        </PdfToolLayout>
    );
}