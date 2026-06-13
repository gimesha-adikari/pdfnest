"use client";

import React, {useState, useEffect, useCallback, useMemo, useRef} from "react";
import {
    Undo2,
    Redo2,
    Download,
    Layers,
    Type,
    Scissors,
    ShieldAlert,
    Maximize2,
    RotateCw,
    Trash2,
    Plus,
    Settings,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Sliders,
    Files,
    X,
    FolderPlus,
    Tag,
    Hash,
    Loader2,
    FileText,
    User,
    Unlock
} from "lucide-react";
import {uploadAndDownloadFile} from "@/lib/apiClient";
import {getFriendlyErrorMessage} from "@/lib/errorHandler";
import {notify} from "@/lib/notify";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

type ActivePanel = "pages" | "watermark" | "merge" | "compress" | "metadata" | "security";

interface VirtualPage {
    id: string;
    pageNumber: number;
}

const STYLISTIC_FONTS = [
    {id: "Helvetica", name: "Sans-Serif Modern (Helvetica)", cssClass: "font-sans font-bold"},
    {id: "Times-Roman", name: "Classic Editorial (Times Roman)", cssClass: "font-serif font-medium"},
    {id: "Courier", name: "Monospace Tech (Courier)", cssClass: "font-mono font-normal"}
];

export default function VirtualDocumentStudio() {
    const [activeFile, setActiveFile] = useState<File | null>(null);
    const [presentBlob, setPresentBlob] = useState<Blob | null>(null);
    const [pastBlobs, setPastBlobs] = useState<Blob[]>([]);
    const [futureBlobs, setFutureBlobs] = useState<Blob[]>([]);

    const [activePanel, setActivePanel] = useState<ActivePanel>("pages");
    const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
    const [virtualPages, setVirtualPages] = useState<VirtualPage[]>([]);

    const [previewImageSrc, setPreviewImageSrc] = useState<string>("");
    const [isRenderingPreview, setIsRenderingPreview] = useState<boolean>(false);
    const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

    const [previewCacheToken, setPreviewCacheToken] = useState<string>("");

    const [shouldReLockOnExport, setShouldReLockOnExport] = useState<boolean>(false);
    const [originalEncryptionPassword, setOriginalEncryptionPassword] = useState<string>("");

    const [secondaryFilePassword, setSecondaryFilePassword] = useState("");
    const [isSecondaryLocked, setIsSecondaryLocked] = useState(false);

    const [pendingLockedFile, setPendingLockedFile] = useState<File | null>(null);
    const [uploadPromptPassword, setUploadPromptPassword] = useState<string>("");
    const [isCheckingPassword, setIsCheckingPassword] = useState<boolean>(false);

    const [pendingMergeLockedFile, setPendingMergeLockedFile] = useState<File | null>(null);
    const [mergePromptPassword, setMergePromptPassword] = useState<string>("");
    const [isCheckingMergePassword, setIsCheckingMergePassword] = useState<boolean>(false);

    const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
    const [watermarkFontSize, setWatermarkFontSize] = useState<number>(48);
    const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
    const [watermarkRotation, setWatermarkRotation] = useState(45);
    const [watermarkFont, setWatermarkFont] = useState("Helvetica");

    const [docTitle, setDocTitle] = useState("");
    const [docAuthor, setDocAuthor] = useState("");
    const [docSubject, setDocSubject] = useState("");
    const [docKeywords, setDocKeywords] = useState("");

    const [securityPass, setSecurityPass] = useState("");

    const appendFileInputRef = useRef<HTMLInputElement>(null);

    const activeFontCssClass = useMemo(() => {
        return STYLISTIC_FONTS.find(f => f.id === watermarkFont)?.cssClass || "font-sans font-bold";
    }, [watermarkFont]);

    const scanBlobPageBoundaries = async (targetBlob: Blob, forcedPassword?: string): Promise<VirtualPage[]> => {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
        const buffer = await targetBlob.arrayBuffer();

        const password = forcedPassword !== undefined ? forcedPassword : ((targetBlob as any).originalPassword || "");

        const doc = await pdfjs.getDocument({
            data: buffer,
            password: password
        }).promise;

        return Array.from({length: doc.numPages}, (_, i) => ({
            id: `v-page-${crypto.randomUUID()}`,
            pageNumber: i + 1
        }));
    };

    const updateWorkspaceState = useCallback(async (newBlob: Blob) => {
        if (!presentBlob) return;

        const existingPassword = (presentBlob as any).originalPassword;
        if (existingPassword) {
            (newBlob as any).originalPassword = existingPassword;
        }

        setIsProcessingAction(true);
        try {
            const refreshedPages = await scanBlobPageBoundaries(newBlob);
            setVirtualPages(refreshedPages);
            setPastBlobs(prev => [...prev, presentBlob]);
            setFutureBlobs([]);
            setPresentBlob(newBlob);
            setPreviewCacheToken(crypto.randomUUID());
        } catch (error) {
            console.error("Workspace state transition failed:", error);
        } finally {
            setIsProcessingAction(false);
        }
    }, [presentBlob]);

    const executeStudioPipeline = async (operationName: string, actionFn: (targetBlob: Blob) => Promise<Blob>) => {
        if (!presentBlob || !activeFile) return;
        setIsProcessingAction(true);

        try {
            let mutatedBlob = await actionFn(presentBlob);

            await updateWorkspaceState(mutatedBlob);
        } catch (err) {
            notify(getFriendlyErrorMessage(err));
        } finally {
            setIsProcessingAction(false);
        }
    };

    const handleInitialUpload = async (acceptedFiles: File[]) => {
        if (!acceptedFiles || acceptedFiles.length === 0) return;
        const targetFile = acceptedFiles[0];

        try {
            const initialPages = await scanBlobPageBoundaries(targetFile, "");
            await initializeWorkspaceWithCredentials(targetFile, "", initialPages);
        } catch (err: any) {
            if (err.name === "PasswordException" || err.code === 1 || String(err).includes("password")) {
                setPendingLockedFile(targetFile);
                setUploadPromptPassword("");
            } else {
                notify("Failed to parse document structure metrics: " + err.message);
            }
        }
    };

    const handleVerifyAndMountLockedFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pendingLockedFile || !uploadPromptPassword.trim()) return;

        setIsCheckingPassword(true);
        try {
            const validKey = uploadPromptPassword.trim();

            const unlockData = new FormData();
            unlockData.append("file", pendingLockedFile);
            unlockData.append("password", validKey);
            const clearUnwrappedBlob = await uploadAndDownloadFile("/api/security/unlock", unlockData);

            const verifiedPages = await scanBlobPageBoundaries(clearUnwrappedBlob, "");

            setOriginalEncryptionPassword(validKey);
            setShouldReLockOnExport(true);
            setPendingLockedFile(null);
            setUploadPromptPassword("");

            await initializeWorkspaceWithCredentials(clearUnwrappedBlob, validKey, verifiedPages);
        } catch (err: any) {
            notify("Invalid document credentials key constraint! Try again.");
        } finally {
            setIsCheckingPassword(false);
        }
    };


    const isPdfPasswordProtected = async (file: File): Promise<boolean> => {
        try {
            await scanBlobPageBoundaries(file, "");
            return false;
        } catch (err: any) {
            return (
                err?.name === "PasswordException" ||
                err?.code === 1 ||
                String(err).toLowerCase().includes("password")
            );
        }
    };

    const executeSecondaryMerge = async (secondaryFile: File) => {
        if (!activeFile) return;

        await executeStudioPipeline("Merge Document", async (unlockedBlob) => {
            const formData = new FormData();

            formData.append(
                "files",
                new File([unlockedBlob], activeFile.name, {
                    type: "application/pdf",
                })
            );

            formData.append("files", secondaryFile);

            return await uploadAndDownloadFile("/api/structure/merge", formData);
        });

        notify(`Successfully appended supplementary track: "${secondaryFile.name}"!`);
    };

    const handleUnlockAndMergeSecondaryFile = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!pendingMergeLockedFile || !mergePromptPassword.trim()) return;

        setIsCheckingMergePassword(true);

        try {
            const unlockData = new FormData();

            unlockData.append("file", pendingMergeLockedFile);
            unlockData.append("password", mergePromptPassword.trim());

            const unlockedBlob = await uploadAndDownloadFile(
                "/api/security/unlock",
                unlockData
            );

            const unlockedFile = new File(
                [unlockedBlob],
                pendingMergeLockedFile.name,
                {
                    type: "application/pdf",
                }
            );

            await executeSecondaryMerge(unlockedFile);

            setPendingMergeLockedFile(null);
            setMergePromptPassword("");
        } catch (err) {
            notify("Invalid password for secondary PDF.");
        } finally {
            setIsCheckingMergePassword(false);
        }
    };

    const initializeWorkspaceWithCredentials = async (fileBlob: Blob, key: string, structuralPages: VirtualPage[]) => {
        setActiveFile(new File([fileBlob], activeFile?.name || pendingLockedFile?.name || "document.pdf", {type: "application/pdf"}));
        setPresentBlob(fileBlob);
        setPastBlobs([]);
        setFutureBlobs([]);
        setCurrentPageIndex(0);
        setDocTitle((activeFile?.name || pendingLockedFile?.name || "document.pdf").replace(/\.pdf$/i, ""));
        setVirtualPages(structuralPages);
        setPreviewCacheToken(crypto.randomUUID());

        try {
            const formData = new FormData();
            formData.append("file", new File([fileBlob], "doc.pdf", {type: "application/pdf"}));
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
            const res = await fetch(`${baseUrl}/api/structure/metadata/fetch`, {method: "POST", body: formData});
            if (res.ok) {
                const props = await res.json();
                setDocTitle(props["title"] || (activeFile?.name || pendingLockedFile?.name || "document.pdf").replace(/\.pdf$/i, ""));
                setDocAuthor(props["author"] || "");
                setDocSubject(props["subject"] || "");
                setDocKeywords(props["keywords"] || "");
            }
        } catch (e) {
            console.warn("Initial metadata metrics parsing trace bypassed:", e);
        }
    };

    const handleResetWorkspace = () => {
        setActiveFile(null);
        setPresentBlob(null);
        setPastBlobs([]);
        setFutureBlobs([]);
        setVirtualPages([]);
        setPendingLockedFile(null);
        setUploadPromptPassword("");
        setShouldReLockOnExport(false);
        setOriginalEncryptionPassword("");
        if (previewImageSrc) URL.revokeObjectURL(previewImageSrc);
        setPreviewImageSrc("");
        setPreviewCacheToken("");
    };

    useEffect(() => {
        if (!presentBlob || virtualPages.length === 0 || !virtualPages[currentPageIndex]) {
            setPreviewImageSrc("");
            return;
        }

        const fetchPreviewFrame = async () => {
            setIsRenderingPreview(true);
            try {
                const formData = new FormData();
                const tempFile = new File([presentBlob], activeFile?.name || "document.pdf", {type: "application/pdf"});

                formData.append("file", tempFile);
                formData.append("page", (currentPageIndex + 1).toString());
                formData.append("scale", "2.0");
                formData.append("cacheBuster", previewCacheToken);

                const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
                const response = await fetch(`${baseUrl}/api/conversion/preview/page`, {
                    method: "POST",
                    body: formData,
                });

                if (response.ok) {
                    const imgBlob = await response.blob();
                    if (previewImageSrc && previewImageSrc.trim() !== "") {
                        URL.revokeObjectURL(previewImageSrc);
                    }
                    setPreviewImageSrc(URL.createObjectURL(imgBlob));
                } else {
                    console.error(`Preview system endpoint rejected translation request with status: ${response.status}`);
                }
            } catch (err) {
                console.error("Failed to render high-fidelity server preview layout asset:", err);
            } finally {
                setIsRenderingPreview(false);
            }
        };

        fetchPreviewFrame();
    }, [presentBlob, currentPageIndex, virtualPages, previewCacheToken]);

    useEffect(() => {
        return () => {
            if (previewImageSrc && previewImageSrc.trim() !== "") URL.revokeObjectURL(previewImageSrc);
        };
    }, [previewImageSrc]);

    const handleRotateActivePage = async () => {
        if (!activeFile) return;
        await executeStudioPipeline("Rotate Page", async (unlockedBlob) => {
            const formData = new FormData();
            formData.append("file", new File([unlockedBlob], activeFile.name, {type: "application/pdf"}));

            const actualPageNumber = (currentPageIndex + 1).toString();
            const rotationMatrixMap = {[actualPageNumber]: 90};
            formData.append("rotations", JSON.stringify(rotationMatrixMap));

            return await uploadAndDownloadFile("/api/structure/rotate", formData);
        });
    };

    const handleDeleteActivePage = async () => {
        if (!activeFile || virtualPages.length <= 1) return;
        await executeStudioPipeline("Delete Page", async (unlockedBlob) => {
            const formData = new FormData();
            formData.append("file", new File([unlockedBlob], activeFile.name, {type: "application/pdf"}));
            formData.append("pages", (currentPageIndex + 1).toString());

            const nextPages = virtualPages.filter((_, i) => i !== currentPageIndex);
            setVirtualPages(nextPages);
            if (currentPageIndex >= nextPages.length) {
                setCurrentPageIndex(Math.max(0, nextPages.length - 1));
            }

            return await uploadAndDownloadFile("/api/structure/delete-pages", formData);
        });
    };

    const handleApplyWatermark = async () => {
        if (!activeFile) return;
        await executeStudioPipeline("Apply Watermark", async (unlockedBlob) => {
            const formData = new FormData();
            formData.append("file", new File([unlockedBlob], activeFile.name, {type: "application/pdf"}));

            const normalizedScale = (watermarkFontSize / 40).toFixed(2);
            const description = `font:${watermarkFont}, pos:c, scale:${normalizedScale}, rot:${watermarkRotation}, op:${watermarkOpacity}`;

            formData.append("description", description);
            formData.append("text", watermarkText.trim());

            return await uploadAndDownloadFile("/api/structure/watermark", formData);
        });
    };

    const handleAppendSecondaryFile = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const addedFiles = Array.from(e.target.files || []);

        if (addedFiles.length === 0 || !activeFile) return;

        const secondaryFile = addedFiles[0];

        e.target.value = "";

        try {
            const locked = await isPdfPasswordProtected(secondaryFile);

            if (locked) {
                setPendingMergeLockedFile(secondaryFile);
                setMergePromptPassword("");
                return;
            }

            await executeSecondaryMerge(secondaryFile);
        } catch (err: any) {
            notify(
                "Failed to analyze secondary PDF structure: " +
                (err?.message || "Unknown error")
            );
        }
    };

    const handleCompressDocument = async () => {
        if (!activeFile) return;
        await executeStudioPipeline("Compress PDF File", async (unlockedBlob) => {
            const formData = new FormData();
            formData.append("file", new File([unlockedBlob], activeFile.name, {type: "application/pdf"}));

            return await uploadAndDownloadFile("/api/optimize/compress", formData);
        });
        notify("Document payload size successfully optimized on the backend server node!");
    };

    const handleUpdateMetadata = async () => {
        if (!activeFile) return;
        await executeStudioPipeline("Update Metadata", async (unlockedBlob) => {
            const formData = new FormData();
            formData.append("file", new File([unlockedBlob], activeFile.name, {type: "application/pdf"}));
            formData.append("title", docTitle.trim());
            formData.append("author", docAuthor.trim());
            formData.append("subject", docSubject.trim());
            formData.append("keywords", docKeywords.trim());

            return await uploadAndDownloadFile("/api/structure/update-metadata", formData);
        });
        notify("Document properties updated successfully!");
    };

    const handleLockDocument = () => {
        if (!presentBlob || !securityPass.trim()) return;

        (presentBlob as any).originalPassword = securityPass.trim();

        setOriginalEncryptionPassword(securityPass.trim());
        setShouldReLockOnExport(true);
        setSecurityPass("");

        notify("Encryption key successfully updated for this session.");
    };

    const handleExportFile = async () => {
        if (!presentBlob || !activeFile) return;
        setIsProcessingAction(true);
        try {
            let exportBlob = presentBlob;

            const password = (presentBlob as any).originalPassword;

            if (password) {
                const lockData = new FormData();
                lockData.append("file", new File([presentBlob], activeFile.name, {type: "application/pdf"}));
                lockData.append("password", password);
                exportBlob = await uploadAndDownloadFile("/api/security/lock", lockData);
            }

            const url = window.URL.createObjectURL(exportBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = activeFile.name.replace(/\.pdf$/i, "-protected.pdf");
            a.click();
            window.URL.revokeObjectURL(url);
        } finally {
            setIsProcessingAction(false);
        }
    };

    const executeUndo = async () => {
        if (pastBlobs.length === 0 || !presentBlob || !activeFile) return;
        const targetBlob = pastBlobs[pastBlobs.length - 1];

        setIsProcessingAction(true);
        try {
            const revertedPages = await scanBlobPageBoundaries(targetBlob, "");
            setVirtualPages(revertedPages);

            setPastBlobs(prev => prev.slice(0, -1));
            setFutureBlobs(prev => [...prev, presentBlob]);

            setPresentBlob(targetBlob);
            setCurrentPageIndex(0);
            setPreviewCacheToken(crypto.randomUUID());
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessingAction(false);
        }
    };

    const executeRedo = async () => {
        if (futureBlobs.length === 0 || !presentBlob || !activeFile) return;
        const targetBlob = futureBlobs[futureBlobs.length - 1];

        setIsProcessingAction(true);
        try {
            const advancedPages = await scanBlobPageBoundaries(targetBlob, "");
            setVirtualPages(advancedPages);

            setFutureBlobs(prev => prev.slice(0, -1));
            setPastBlobs(prev => [...prev, presentBlob]);

            setPresentBlob(targetBlob);
            setCurrentPageIndex(0);
            setPreviewCacheToken(crypto.randomUUID());
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessingAction(false);
        }
    };

    return (
        <PdfToolLayout>
            <div className="-mx-4 xl:-mx-60 px-4">
                <div
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 mb-6 rounded-2xl bg-[var(--card)] border border-[color:var(--border)] shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                            <Layers size={22}/>
                        </div>
                        <div>
                            <h2 className="text-md font-bold text-[color:var(--foreground)]">Virtual Document
                                Studio</h2>
                            <p className="text-xs text-[color:var(--muted)]">Chain actions, reorganize page topologies,
                                and stamp vectors in real-time.</p>
                        </div>
                    </div>

                    {presentBlob && (
                        <div className="flex items-center gap-2 self-end md:self-auto">
                            <button
                                type="button"
                                onClick={executeUndo}
                                disabled={pastBlobs.length === 0}
                                className="p-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] hover:text-indigo-500 text-[color:var(--muted)] disabled:opacity-30 transition shadow-sm"
                                title="Undo Step"
                            >
                                <Undo2 size={16}/>
                            </button>
                            <button
                                type="button"
                                onClick={executeRedo}
                                disabled={futureBlobs.length === 0}
                                className="p-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] hover:text-indigo-500 text-[color:var(--muted)] disabled:opacity-30 transition shadow-sm"
                                title="Redo Step"
                            >
                                <Redo2 size={16}/>
                            </button>

                            <div className="w-[1px] h-6 bg-[color:var(--border)] mx-1"/>

                            <button
                                type="button"
                                onClick={handleExportFile}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-600/10 transition"
                            >
                                <Download size={14}/> Export File
                            </button>
                        </div>
                    )}
                </div>

                {pendingLockedFile && (
                    <div
                        className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-8 max-w-xl mx-auto shadow-xl text-center animate-in fade-in zoom-in-95 duration-200 mb-8">
                        <div
                            className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Unlock size={22}/>
                        </div>
                        <h3 className="text-md font-bold text-[color:var(--foreground)] mb-1">Encrypted File
                            Detected</h3>
                        <p className="text-xs text-[color:var(--muted)] mb-6 leading-relaxed">
                            This document is encrypted. Provide its correct passphrase to initialize the editing
                            environment workspace.
                        </p>
                        <form onSubmit={handleVerifyAndMountLockedFile} className="flex gap-2 max-w-md mx-auto">
                            <input
                                type="password"
                                required
                                value={uploadPromptPassword}
                                onChange={(e) => setUploadPromptPassword(e.target.value)}
                                placeholder="Enter document password"
                                className="flex-1 px-4 py-2.5 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none text-[color:var(--foreground)] font-medium"
                                disabled={isCheckingPassword}
                            />
                            <button
                                type="submit"
                                disabled={isCheckingPassword || !uploadPromptPassword.trim()}
                                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-md shadow-amber-600/10 flex items-center gap-1.5"
                            >
                                {isCheckingPassword && <Loader2 size={12} className="animate-spin"/>} Unlock File
                            </button>
                        </form>
                        <button
                            type="button"
                            onClick={handleResetWorkspace}
                            className="text-[10px] text-zinc-400 hover:text-zinc-200 transition font-bold mt-4 block mx-auto"
                        >
                            Cancel Upload
                        </button>
                    </div>
                )}

                {!presentBlob && !pendingLockedFile && (
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-12 shadow-xl">
                        <PdfUploader
                            onFilesAccepted={handleInitialUpload}
                            title="Drop document context onto Canvas Studio Matrix"
                            description="Mount an active session file to initialize real-time interactive multi-tool editing dashboards"
                            multiple={false}
                            accept=".pdf"
                        />
                    </div>
                )}

                {presentBlob && activeFile && !pendingLockedFile && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start min-h-[75vh]">

                        <div className="xl:col-span-2 flex flex-col gap-4 bg-[var(--card)] border border-[color:var(--border)] rounded-2xl p-4 shadow-sm h-[75vh] overflow-hidden">
                            <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
            <Files size={14} /> Layout Pages Map
        </span>
                                <button
                                    type="button"
                                    onClick={handleResetWorkspace}
                                    className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg text-[10px] font-bold flex items-center gap-1 transition"
                                >
                                    <X size={12} /> Clear Session
                                </button>
                            </div>

                            <div
                                style={{
                                    scrollbarWidth: 'thin', /* For Firefox fallback */
                                }}
                                className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-indigo-500 transition-colors"
                            >
                                {virtualPages.map((page, idx) => (
                                    <div
                                        key={page.id}
                                        onClick={() => setCurrentPageIndex(idx)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer relative group flex gap-3 items-center ${
                                            currentPageIndex === idx
                                                ? "bg-indigo-500/5 border-indigo-500/60 shadow-sm"
                                                : "bg-[var(--background)]/40 border-[color:var(--border)] hover:border-[color:var(--muted)]"
                                        }`}
                                    >
                                        <div
                                            className="w-10 h-14 bg-[color:var(--background)] border rounded shadow-sm shrink-0 flex items-center justify-center text-[10px] font-mono font-bold text-gray-400 select-none">
                                            P: {page.pageNumber}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-[color:var(--foreground)]">Page {idx + 1}</p>
                                            <p className="text-[10px] text-[color:var(--muted)]">Sequence code:
                                                #{page.pageNumber}</p>
                                        </div>

                                        <div
                                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 bg-[var(--card)] pl-1 border-l border-[color:var(--border)] h-fit">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCurrentPageIndex(idx);
                                                    handleRotateActivePage();
                                                }}
                                                className="p-1 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded transition"
                                                title="Rotate Page"
                                            >
                                                <RotateCw size={12}/>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCurrentPageIndex(idx);
                                                    handleDeleteActivePage();
                                                }}
                                                className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded transition"
                                                title="Delete Page"
                                            >
                                                <Trash2 size={12}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-2 border-t border-[color:var(--border)]">
                                <PdfFileInfo file={activeFile}/>
                            </div>
                        </div>

                        <div
                            className="xl:col-span-6 flex flex-col justify-between items-center bg-[var(--card)] border border-[color:var(--border)] rounded-2xl p-4 shadow-sm h-[75vh] relative">

                            {(isRenderingPreview || isProcessingAction) && (
                                <div
                                    className="absolute inset-0 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center text-xs font-medium text-zinc-500 rounded-2xl">
                                    <Loader2 className="animate-spin text-indigo-500 mb-2" size={26}/>
                                    Syncing high-fidelity server layouts...
                                </div>
                            )}

                            <div
                                className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-xs font-bold text-[color:var(--foreground)]">
                                <span className="flex items-center gap-1.5"><Maximize2 size={14}
                                                                                       className="text-indigo-500"/> Active Visualizer Node</span>
                                <span
                                    className="font-mono text-[10px] bg-[color:var(--background)] border border-[color:var(--border)] px-2 py-0.5 rounded text-[color:var(--muted)]">
                                Sheet {currentPageIndex + 1} of {virtualPages.length}
                            </span>
                            </div>

                            <div
                                className="flex-1 w-full flex items-center justify-center bg-[var(--background)]/40 dark:bg-black/10 rounded-xl border border-[color:var(--border)] m-4 relative overflow-hidden select-none p-2">
                                {previewImageSrc ? (
                                    <div
                                        className="relative inline-block max-w-full max-h-[52vh] overflow-hidden shadow-2xl rounded border bg-white">
                                        <img
                                            src={previewImageSrc}
                                            alt={`Active page view context ${currentPageIndex + 1}`}
                                            className="w-auto h-auto max-w-full max-h-[52vh] block object-contain"
                                        />

                                        {activePanel === "watermark" && watermarkText.trim() && (
                                            <div
                                                className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden">
                                                <div
                                                    style={{
                                                        opacity: watermarkOpacity,
                                                        transform: `rotate(-${watermarkRotation}deg)`,
                                                        fontSize: `${Math.max(10, watermarkFontSize * 0.4)}px`
                                                    }}
                                                    className={`text-red-500 font-black tracking-widest uppercase border-4 border-dashed border-red-500/30 px-4 py-2 select-none text-center whitespace-nowrap ${activeFontCssClass}`}
                                                >
                                                    {watermarkText}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs text-[color:var(--muted)]">Compiling image workspace matrices...</span>
                                )}
                            </div>

                            <div className="w-full flex items-center justify-center gap-4">
                                <button
                                    type="button"
                                    disabled={currentPageIndex <= 0}
                                    onClick={() => setCurrentPageIndex(prev => prev - 1)}
                                    className="p-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] hover:text-indigo-500 disabled:opacity-20 transition"
                                >
                                    <ChevronLeft size={16}/>
                                </button>
                                <span className="text-xs font-mono font-bold text-[color:var(--foreground)]">
                                Page {currentPageIndex + 1}
                            </span>
                                <button
                                    type="button"
                                    disabled={currentPageIndex >= virtualPages.length - 1}
                                    onClick={() => setCurrentPageIndex(prev => prev + 1)}
                                    className="p-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] hover:text-indigo-500 disabled:opacity-20 transition"
                                >
                                    <ChevronRight size={16}/>
                                </button>
                            </div>
                        </div>

                        <div
                            className="xl:col-span-4 flex flex-col bg-[var(--card)] border border-[color:var(--border)] rounded-2xl shadow-sm h-[75vh] overflow-hidden">

                            <div
                                onMouseDown={(e) => {
                                    const container = e.currentTarget;
                                    container.dataset.isDown = "true";
                                    container.classList.add('active:cursor-grabbing');
                                    container.dataset.startX = String(e.pageX - container.offsetLeft);
                                    container.dataset.scrollLeft = String(container.scrollLeft);
                                }}
                                onMouseLeave={(e) => {
                                    const container = e.currentTarget;
                                    container.dataset.isDown = "false";
                                    container.classList.remove('active:cursor-grabbing');
                                }}
                                onMouseUp={(e) => {
                                    const container = e.currentTarget;
                                    container.dataset.isDown = "false";
                                    container.classList.remove('active:cursor-grabbing');
                                }}
                                onMouseMove={(e) => {
                                    const container = e.currentTarget;
                                    if (container.dataset.isDown !== "true") return;
                                    e.preventDefault();
                                    const x = e.pageX - container.offsetLeft;
                                    const startX = Number(container.dataset.startX || 0);
                                    const scrollLeft = Number(container.dataset.scrollLeft || 0);
                                    const walk = (x - startX) * 1.5;
                                    container.scrollLeft = scrollLeft - walk;
                                }}
                                className="flex gap-1.5 overflow-x-auto cursor-grab select-none p-2 border-b border-[color:var(--border)] bg-[color:var(--background)]/30 shrink-0 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            >
                                {(["pages", "watermark", "merge", "compress", "metadata", "security"] as ActivePanel[]).map((panel) => (
                                    <button
                                        key={panel}
                                        type="button"
                                        onClick={(e) => {
                                            const container = e.currentTarget.parentElement;
                                            if (container && container.dataset.isDown === "true") return;
                                            setActivePanel(panel);
                                        }}
                                        className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider rounded-xl border transition-all shrink-0 ${
                                            activePanel === panel
                                                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                                : "bg-[var(--card)] border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                                        }`}
                                    >
                                        {panel}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
                                {activePanel === "pages" && (
                                    <div className="space-y-4 animate-in fade-in-50 duration-150">
                                        <div
                                            className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-2">
                                            <Sliders size={14} className="text-indigo-500"/> Page Vector Operations
                                        </div>
                                        <p className="text-xs text-[color:var(--muted)] leading-relaxed">
                                            Execute standalone geometric changes directly applied to the currently
                                            loaded index track.
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={handleRotateActivePage}
                                                className="p-3 text-xs font-bold border border-[color:var(--border)] bg-[color:var(--background)]/40 hover:bg-indigo-500/5 hover:border-indigo-500/40 rounded-xl flex items-center justify-center gap-2 transition"
                                            >
                                                <RotateCw size={14}/> Rotate 90°
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDeleteActivePage}
                                                className="p-3 text-xs font-bold border border-[color:var(--border)] bg-[color:var(--background)]/40 hover:bg-red-500/5 hover:border-red-500/40 rounded-xl flex items-center justify-center gap-2 text-red-500 transition"
                                            >
                                                <Trash2 size={14}/> Remove Page
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activePanel === "watermark" && (
                                    <div className="space-y-5 animate-in fade-in-50 duration-150">
                                        <div
                                            className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-2">
                                            <Type size={14} className="text-indigo-500"/> Secure Overlays & Stamps
                                        </div>

                                        <div className="space-y-2">
                                            <label
                                                className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1"><Sparkles
                                                size={11}/> Watermark Text</label>
                                            <input
                                                type="text"
                                                value={watermarkText}
                                                onChange={(e) => setWatermarkText(e.target.value)}
                                                className="w-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none text-[color:var(--foreground)] font-medium transition"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label
                                                className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Typography
                                                Family</label>
                                            <select
                                                value={watermarkFont}
                                                onChange={(e) => setWatermarkFont(e.target.value)}
                                                className="w-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none font-medium text-[color:var(--foreground)]"
                                            >
                                                {STYLISTIC_FONTS.map(font => (
                                                    <option key={font.id} value={font.id}>{font.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <div
                                                className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                                <span>Sizing Scale Dimensions</span>
                                                <span className="text-indigo-500 font-mono">{watermarkFontSize}%</span>
                                            </div>
                                            <input
                                                type="range" min="10" max="300" value={watermarkFontSize}
                                                onChange={(e) => setWatermarkFontSize(Number(e.target.value))}
                                                className="w-full accent-indigo-500"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div
                                                className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                                <span>Blend Opacity</span>
                                                <span
                                                    className="text-indigo-500 font-mono">{Math.round(watermarkOpacity * 100)}%</span>
                                            </div>
                                            <input
                                                type="range" min="0.05" max="1.0" step="0.05" value={watermarkOpacity}
                                                onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                                                className="w-full accent-indigo-500"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div
                                                className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                                <span>Rotation Angle</span>
                                                <span className="text-indigo-500 font-mono">{watermarkRotation}°</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="360" value={watermarkRotation}
                                                onChange={(e) => setWatermarkRotation(Number(e.target.value))}
                                                className="w-full accent-indigo-500"
                                            />
                                        </div>

                                        <PdfActionButton
                                            text="Apply Stamp across Sheets"
                                            loadingText="Burning Layer Matrices..."
                                            loading={isProcessingAction}
                                            onClick={handleApplyWatermark}
                                        />
                                    </div>
                                )}

                                {activePanel === "merge" && (
                                    <div className="space-y-4 animate-in fade-in-50 duration-150">
                                        <div
                                            className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-2">
                                            <FolderPlus size={14} className="text-indigo-500"/> Combine Supplementary
                                            File
                                        </div>
                                        <p className="text-xs text-[color:var(--muted)] leading-relaxed">
                                            Select another document asset container. The engine will instantly bake its
                                            contents onto the back tail limits of this track.
                                        </p>

                                        {pendingMergeLockedFile && (
                                            <div
                                                className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-9 h-9 bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center shrink-0">
                                                        <Unlock size={16}/>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xs font-bold text-[color:var(--foreground)]">Locked
                                                            PDF Detected</h3>
                                                        <p className="text-[10px] text-[color:var(--muted)]">Enter the
                                                            password to unlock and merge this PDF.</p>
                                                    </div>
                                                </div>

                                                <form onSubmit={handleUnlockAndMergeSecondaryFile}
                                                      className="space-y-3">
                                                    <input
                                                        type="password"
                                                        required
                                                        value={mergePromptPassword}
                                                        onChange={(e) => setMergePromptPassword(e.target.value)}
                                                        placeholder="Enter PDF password"
                                                        className="w-full px-3 py-2.5 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none text-[color:var(--foreground)] font-medium"
                                                        disabled={isCheckingMergePassword}
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="submit"
                                                            disabled={isCheckingMergePassword || !mergePromptPassword.trim()}
                                                            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-md shadow-indigo-600/10 flex items-center justify-center gap-1.5"
                                                        >
                                                            {isCheckingMergePassword &&
                                                                <Loader2 size={12} className="animate-spin"/>} Unlock &
                                                            Merge
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setPendingMergeLockedFile(null);
                                                                setMergePromptPassword("");
                                                            }}
                                                            className="px-4 py-2.5 border border-[color:var(--border)] hover:border-red-500/40 hover:bg-red-500/5 text-xs font-bold rounded-xl transition"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        )}

                                        <input type="file" ref={appendFileInputRef} accept=".pdf" className="hidden"
                                               onChange={handleAppendSecondaryFile}/>
                                        <div
                                            onClick={() => appendFileInputRef.current?.click()}
                                            className="p-6 border-2 border-dashed border-[color:var(--border)] hover:border-indigo-500/40 bg-[var(--background)]/30 hover:bg-indigo-500/5 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 group"
                                        >
                                            <Plus size={20}
                                                  className="text-[color:var(--muted)] group-hover:text-indigo-500 transition-colors"/>
                                            <span
                                                className="text-xs font-bold text-[color:var(--foreground)] group-hover:text-indigo-500 transition-colors">Append Supplementary Track</span>
                                            <span className="text-[10px] text-[color:var(--muted)]">Accepts standard .pdf files directly</span>
                                        </div>
                                    </div>
                                )}

                                {activePanel === "compress" && (
                                    <div className="space-y-4 animate-in fade-in-50 duration-150">
                                        <div
                                            className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-2">
                                            <Scissors size={14} className="text-indigo-500"/> Size Allocator
                                            Optimization
                                        </div>
                                        <p className="text-xs text-[color:var(--muted)] leading-relaxed">
                                            Ghostscript triggers layout optimization routines directly applied onto the
                                            file stream buffer context.
                                        </p>
                                        <PdfActionButton text="Optimize PDF File Size"
                                                         loadingText="Processing Ghostscript Pipeline..."
                                                         loading={isProcessingAction} onClick={handleCompressDocument}/>
                                    </div>
                                )}

                                {activePanel === "metadata" && (
                                    <div className="space-y-4 animate-in fade-in-50 duration-150">
                                        <div
                                            className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-2">
                                            <Tag size={14} className="text-indigo-500"/> Info Table Dictionary Editor
                                        </div>
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <label
                                                    className="text-[10px] font-bold text-[color:var(--muted)] flex items-center gap-1 uppercase"><FileText
                                                    size={10}/> Document Title</label>
                                                <input type="text" value={docTitle}
                                                       onChange={(e) => setDocTitle(e.target.value)}
                                                       className="w-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none font-medium text-[color:var(--foreground)]"/>
                                            </div>
                                            <div className="space-y-1">
                                                <label
                                                    className="text-[10px] font-bold text-[color:var(--muted)] flex items-center gap-1 uppercase"><User
                                                    size={10}/> Creator Signature</label>
                                                <input type="text" value={docAuthor}
                                                       onChange={(e) => setDocAuthor(e.target.value)}
                                                       className="w-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none font-medium text-[color:var(--foreground)]"
                                                       placeholder="Acme Corp Admin"/>
                                            </div>
                                            <div className="space-y-1">
                                                <label
                                                    className="text-[10px] font-bold text-[color:var(--muted)] flex items-center gap-1 uppercase"><Tag
                                                    size={10}/> Subject Matter</label>
                                                <input type="text" value={docSubject}
                                                       onChange={(e) => setDocSubject(e.target.value)}
                                                       className="w-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none font-medium text-[color:var(--foreground)]"
                                                       placeholder="Quarterly Audit"/>
                                            </div>
                                            <div className="space-y-1">
                                                <label
                                                    className="text-[10px] font-bold text-[color:var(--muted)] flex items-center gap-1 uppercase"><Hash
                                                    size={10}/> SEO Index Keywords</label>
                                                <input type="text" value={docKeywords}
                                                       onChange={(e) => setDocKeywords(e.target.value)}
                                                       className="w-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none font-medium text-[color:var(--foreground)]"
                                                       placeholder="report, metrics, secure"/>
                                            </div>
                                        </div>
                                        <PdfActionButton text="Override Metadata Blocks" loading={isProcessingAction}
                                                         onClick={handleUpdateMetadata}/>
                                    </div>
                                )}

                                {activePanel === "security" && (
                                    <div className="space-y-4 animate-in fade-in-50 duration-150">
                                        <div
                                            className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-2">
                                            <ShieldAlert size={14} className="text-indigo-500"/> AES-256 Bit Encryption
                                            Module
                                        </div>
                                        <p className="text-xs text-[color:var(--muted)] leading-relaxed">
                                            {shouldReLockOnExport && originalEncryptionPassword ? (
                                                <span className="text-amber-500 font-medium">This file is unlocked for editing but will be safely re-encrypted upon exporting back to your system.</span>
                                            ) : (
                                                <span>Establish credential rules mapping to this file context. The password will be maintained securely on file export actions.</span>
                                            )}
                                        </p>
                                        <div className="space-y-1">
                                            <label
                                                className="text-[10px] font-bold text-[color:var(--muted)] uppercase">Passphrase
                                                Protection Lock</label>
                                            <input type="password" value={securityPass}
                                                   onChange={(e) => setSecurityPass(e.target.value)}
                                                   className="w-full px-3 py-2 text-xs border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl outline-none font-medium text-[color:var(--foreground)]"
                                                   placeholder="Set Output Secure Key"/>
                                        </div>

                                        <PdfActionButton text="Configure Download Key"
                                                         loadingText="Updating Encryption Profiles..."
                                                         loading={isProcessingAction} onClick={handleLockDocument}/>
                                    </div>
                                )}
                            </div>

                            <div
                                className="p-4 border-t border-[color:var(--border)] bg-[color:var(--background)]/30 shrink-0 flex items-center justify-between text-[10px] text-[color:var(--muted)] font-mono font-bold">
                                <span className="flex items-center gap-1"><Settings size={10} className="animate-spin"/> Live engine instance connected</span>
                                <span>v1.0.0</span>
                            </div>
                        </div>

                    </div>
                )}
            </div>
            <PdfFeatures/>
        </PdfToolLayout>
    );
}