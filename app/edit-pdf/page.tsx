"use client";

import { useState, useRef } from "react";
import { FileEdit, Download, Loader2, Bold, Italic, Underline, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Trash2 } from "lucide-react";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfUploader from "@/components/pdf/PdfUploader";
import { notify } from "@/lib/notify";

export default function EditPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);

    const editorRef = useRef<HTMLDivElement | null>(null);

    // 1. Upload PDF and Extract to HTML from your Go Backend
    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];
        setFile(uploadedFile);
        setIsExtracting(true);

        try {
            const formData = new FormData();
            formData.append("file", uploadedFile);

            const response = await fetch("http://localhost:8080/api/edit/extract", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) throw new Error("Failed to extract layout.");

            const data = await response.json();

            // Set the extracted HTML string directly into the editable element workspace container
            if (editorRef.current) {
                editorRef.current.innerHTML = data.html || "<p></p>";
            }
            notify("Document loaded successfully into the workspace.");
        } catch (error) {
            console.error(error);
            notify("Extraction failed.");
            setFile(null);
        } finally {
            setIsExtracting(false);
        }
    };

    const execCommand = (command: string, value: string = "") => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            editorRef.current.focus();
        }
    };

    const handleCompileSubmit = async () => {
        if (!editorRef.current || !file) return;

        const htmlContent = editorRef.current.innerHTML;
        if (!htmlContent.trim()) {
            notify("Cannot export an empty workspace document.");
            return;
        }

        setIsCompiling(true);

        try {
            const response = await fetch("http://localhost:8080/api/edit/compile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ html: htmlContent }),
            });

            if (!response.ok) throw new Error("Compilation pipeline failure.");

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `edited_${file.name}`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            notify("Success! Your edited PDF has been downloaded.");
        } catch (error) {
            console.error(error);
            notify("Failed to compile document back to PDF layout.");
        } finally {
            setIsCompiling(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Smart PDF Document Editor"
                description="Upload any document to convert its elements into editable text blocks, make inline updates, and export it back to PDF."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                {!file && !isExtracting && (
                    <PdfUploader
                        onFilesAccepted={onDrop}
                        title="Upload Document to Edit"
                        description="Drop a PDF here to mount it into the structural text layout workspace"
                        multiple={false}
                        accept=".pdf"
                    />
                )}

                {isExtracting && (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p>Decompiling layout matrix and mapping fonts into the workspace...</p>
                    </div>
                )}

                {/* Main Workspace Frame Display */}
                <div className={file && !isExtracting ? "space-y-4" : "hidden"}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
                        <div>
                            <h3 className="font-semibold flex items-center gap-2">
                                <FileEdit size={18} className="text-indigo-500"/> Editing Workspace: {file?.name}
                            </h3>
                            <p className="text-xs text-zinc-500 mt-1">Make structural inline updates. Document text flows seamlessly.</p>
                        </div>
                        <button
                            onClick={() => { setFile(null); if (editorRef.current) editorRef.current.innerHTML = ""; }}
                            className="text-sm text-red-500 hover:underline flex items-center gap-1 w-fit"
                        >
                            <Trash2 size={14} /> Clear Workspace
                        </button>
                    </div>

                    {/* Complete Document Formatting Action Toolbar */}
                    <div className="flex flex-wrap items-center gap-1 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-xl border border-[color:var(--border)]">
                        <button type="button" onClick={() => execCommand("bold")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Bold"><Bold size={16} /></button>
                        <button type="button" onClick={() => execCommand("italic")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Italic"><Italic size={16} /></button>
                        <button type="button" onClick={() => execCommand("underline")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Underline"><Underline size={16} /></button>
                        <button type="button" onClick={() => execCommand("strikeThrough")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="StrikeThrough"><Strikethrough size={16} /></button>

                        <div className="h-6 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

                        <button type="button" onClick={() => execCommand("insertUnorderedList")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Bullet List"><List size={16} /></button>
                        <button type="button" onClick={() => execCommand("insertOrderedList")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Numbered List"><ListOrdered size={16} /></button>

                        <div className="h-6 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

                        <button type="button" onClick={() => execCommand("justifyLeft")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Align Left"><AlignLeft size={16} /></button>
                        <button type="button" onClick={() => execCommand("justifyCenter")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Align Center"><AlignCenter size={16} /></button>
                        <button type="button" onClick={() => execCommand("justifyRight")} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm transition" title="Align Right"><AlignRight size={16} /></button>

                        <div className="h-6 w-[1px] bg-zinc-300 dark:bg-zinc-700 mx-1" />

                        {/* Heading Selector Option */}
                        <select
                            onChange={(e) => execCommand("formatBlock", e.target.value)}
                            defaultValue=""
                            className="bg-transparent border border-[color:var(--border)] rounded-lg text-xs p-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="<p>">Normal Text</option>
                            <option value="<h1>">Heading 1</option>
                            <option value="<h2>">Heading 2</option>
                            <option value="<h3>">Heading 3</option>
                        </select>
                    </div>

                    {/* Native contentEditable Rich Text Area Layout View Canvas */}
                    <div className="bg-white text-black rounded-xl border p-8 shadow-inner shadow-zinc-100 min-h-[500px] max-h-[650px] overflow-y-auto focus:outline-none">
                        <div
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            className="prose max-w-none focus:outline-none min-h-[450px]"
                            style={{ fontFamily: 'sans-serif' }}
                        />
                    </div>

                    <button
                        onClick={handleCompileSubmit}
                        disabled={isCompiling}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold transition disabled:opacity-50"
                    >
                        {isCompiling ? (
                            <><Loader2 className="animate-spin" size={20} /> Compiling Layout Structure via WeasyPrint...</>
                        ) : (
                            <><Download size={20} /> Export Changes as Pristine PDF</>
                        )}
                    </button>
                </div>
            </div>
        </PdfToolLayout>
    );
}