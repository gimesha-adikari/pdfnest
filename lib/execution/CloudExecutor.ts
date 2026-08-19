"use client";

import { uploadAndDownloadFile } from "@/lib/api";
import { ExecutionError, ExecutionOptions } from "./types";
import {
    buildPageNumbersDescription,
    buildWatermarkDescription,
} from "./pdfcpu/pdfcpuClient";

export class CloudExecutor {
    static async execute(options: ExecutionOptions): Promise<Blob> {
        const { tool, files, params, onProgress } = options;

        if (!files || files.length === 0) {
            throw new ExecutionError("INVALID_INPUT", "No files provided for cloud execution.");
        }

        const primaryFile = files[0];
        const formData = new FormData();
        const normalizedTool = normalizeTool(tool);

        // 1. Preserve existing multipart field naming ('images' for conversion, 'files' for merge/batch, 'file' for single)
        if (normalizedTool === "images_to_pdf") {
            files.forEach((f) => formData.append("images", f));
        } else if (tool === "merge" || files.length > 1) {
            files.forEach((f) => formData.append("files", f));
        } else {
            formData.append("file", primaryFile);
        }

        // 2. Attach parameters
        if (normalizedTool === "watermark") {
            const watermarkType = params?.watermarkType || (params?.watermarkImage || params?.imageFile ? "image" : "text");
            const description = buildWatermarkDescription(params || {});
            formData.append("description", description);

            if (watermarkType === "image") {
                const imageFile = params?.watermarkImage || params?.imageFile;
                if (typeof File !== "undefined" && imageFile instanceof File) {
                    formData.append("watermarkImage", imageFile);
                }
            } else {
                const textVal = String(params?.text ?? params?.watermarkText ?? "CONFIDENTIAL");
                formData.append("text", textVal);
            }
        } else if (normalizedTool === "add_page_numbers") {
            const description = buildPageNumbersDescription(params || {});
            formData.append("description", description);
        } else {
            Object.entries(params || {}).forEach(([key, val]) => {
                if (val !== undefined && val !== null) {
                    if (typeof File !== "undefined" && val instanceof File) {
                        formData.append(key, val);
                    } else if (typeof Blob !== "undefined" && val instanceof Blob) {
                        formData.append(key, val, key === "signature" ? "signature.png" : "file.bin");
                    } else {
                        formData.append(key, typeof val === "object" ? JSON.stringify(val) : String(val));
                    }
                }
            });
        }

        // 3. Preserve password propagation for per-file passwords (password_0, password_1, ...) and single file_password
        files.forEach((f, idx) => {
            const pwd =
                (options.passwords && options.passwords[idx]) ||
                (f as any).originalPassword ||
                (idx === 0 ? options.password : undefined);
            if (pwd) {
                formData.append(`password_${idx}`, pwd);
                if (idx === 0) {
                    formData.append("file_password", pwd);
                }
            }
        });

        // 4. Resolve backend API endpoint
        const endpoint = getEndpointForTool(tool, params);

        try {
            const blob = await uploadAndDownloadFile(endpoint, formData, onProgress, options.signal);
            return blob;
        } catch (err: unknown) {
            if (
                (err as any)?.code === "USER_CANCELLATION" ||
                (err as any)?.name === "CanceledError" ||
                (err as any)?.name === "AbortError" ||
                options.signal?.aborted
            ) {
                throw new ExecutionError("USER_CANCELLATION", "Request cancelled by user.", err);
            }

            const clientErr = err as any;
            const isUnavailable = isNetworkOrServiceUnavailable(clientErr);
            const errorCode = isUnavailable ? "CLOUD_UNAVAILABLE" : "CLOUD_FAILURE";
            const message = err instanceof Error ? err.message : "Cloud execution rejected or failed.";

            const execErr = new ExecutionError(errorCode, message, err);
            if (typeof clientErr?.status === "number") execErr.status = clientErr.status;
            if (clientErr?.billing) execErr.billing = clientErr.billing;
            throw execErr;
        }
    }
}

function isNetworkOrServiceUnavailable(err: any): boolean {
    if (!err) return false;
    if (err.status === 0) return true;
    if (typeof err.status === "number" && err.status >= 502 && err.status <= 504) return true;
    const msg = typeof err.message === "string" ? err.message.toLowerCase() : "";
    if (
        msg === "pdfnest processing service is currently unavailable." ||
        msg === "network transport failure" ||
        msg.includes("econnrefused") ||
        msg.includes("failed to fetch") ||
        msg.includes("network error")
    ) {
        return true;
    }
    return false;
}

function normalizeTool(tool: string): string {
    switch (tool) {
        case "rotate_pdf":
            return "rotate";
        case "split_pdf":
            return "split";
        case "merge_pdf":
            return "merge";
        case "delete_pages":
            return "delete";
        case "reorder_pages":
            return "reorder";
        case "watermark_pdf":
            return "watermark";
        case "add_page_numbers":
        case "add-page-numbers":
        case "page_numbers":
            return "add_page_numbers";
        case "add_text":
        case "add-text":
        case "addtext":
            return "add_text";
        case "images_to_pdf":
        case "images-to-pdf":
        case "img_to_pdf":
        case "jpg_to_pdf":
        case "jpg-to-pdf":
        case "to_pdf":
        case "to-pdf":
            return "images_to_pdf";
        case "crop":
        case "crop_pdf":
        case "crop-pdf":
            return "crop";
        case "pdf_to_images":
        case "pdf-to-images":
        case "pdf_to_image":
        case "pdf-to-image":
        case "pdf_to_img":
        case "pdf-to-img":
        case "pdf_to_jpg":
        case "pdf-to-jpg":
        case "pdf_to_png":
        case "pdf-to-png":
            return "pdf_to_images";
        case "unlock":
        case "unlock_pdf":
        case "unlock-pdf":
        case "security_unlock":
        case "decrypt":
            return "unlock";
        case "lock":
        case "lock_pdf":
        case "lock-pdf":
        case "protect":
        case "protect_pdf":
        case "protect-pdf":
        case "security_lock":
        case "encrypt":
            return "lock";
        case "pdf_to_text":
        case "pdf-to-text":
        case "to_text":
        case "to-text":
        case "extract_text":
        case "extract-text":
        case "ocr_extract_text":
            return "pdf_to_text";
        case "pdf_to_markdown":
        case "pdf-to-markdown":
        case "to_markdown":
        case "to-markdown":
        case "extract_markdown":
        case "extract-markdown":
            return "pdf_to_markdown";
        case "compress":
        case "compress_pdf":
        case "compress-pdf":
        case "optimize":
        case "optimize_pdf":
        case "optimize-pdf":
        case "optimize_compress":
            return "compress";
        case "sign":
        case "sign_pdf":
        case "sign-pdf":
            return "sign";
        case "repair":
        case "repair_pdf":
        case "repair-pdf":
        case "structure_repair":
            return "repair";
        case "code_to_pdf":
        case "code-to-pdf":
        case "code":
            return "code_to_pdf";
        case "markdown_to_pdf":
        case "markdown-to-pdf":
        case "md_to_pdf":
        case "md-to-pdf":
        case "markdown":
            return "markdown_to_pdf";
        default:
            return tool;
    }
}

function getEndpointForTool(tool: string, params?: Record<string, any>): string {
    switch (tool) {
        case "rotate":
        case "rotate_pdf":
            return "/api/structure/rotate";
        case "split":
        case "split_pdf":
            return "/api/structure/split";
        case "merge":
        case "merge_pdf":
            return "/api/structure/merge";
        case "delete":
        case "delete_pages":
            return "/api/structure/delete-pages";
        case "reorder":
        case "reorder_pages":
            return "/api/structure/reorder-pages";
        case "watermark":
        case "watermark_pdf":
            return "/api/structure/watermark";
        case "add_page_numbers":
        case "add-page-numbers":
        case "page_numbers":
            return "/api/structure/add-page-numbers";
        case "crop":
            return "/api/structure/crop";
        case "pdf_to_images":
        case "pdf-to-images":
        case "pdf_to_image":
        case "pdf-to-image":
        case "pdf_to_img":
        case "pdf-to-img":
        case "pdf_to_jpg":
        case "pdf-to-jpg":
        case "pdf_to_png":
        case "pdf-to-png":
            return "/api/conversion/pdf-to-images";
        case "duplicate":
            return "/api/structure/duplicate";
        case "insert_blank":
            return "/api/structure/insert-blank";
        case "add_text":
        case "add-text":
        case "addtext":
            return "/api/structure/add-text";
        case "images_to_pdf":
        case "images-to-pdf":
        case "img_to_pdf":
        case "jpg_to_pdf":
        case "jpg-to-pdf":
        case "to_pdf":
        case "to-pdf":
            return params?.canvasLayout ? "/api/conversion/custom-to-pdf" : "/api/conversion/to-pdf";
        case "update_metadata":
            return "/api/structure/update-metadata";
        case "compress":
            return "/api/optimize/compress";
        case "grayscale":
            return "/api/optimize/grayscale";
        case "lock":
            return "/api/security/lock";
        case "unlock":
            return "/api/security/unlock";
        case "pdf_to_text":
            return "/api/ocr/extract-text";
        case "pdf_to_markdown":
        case "pdf-to-markdown":
            return "/api/conversion/pdf-to-markdown-async";
        case "highlight":
        case "highlight_pdf":
        case "highlight-pdf":
            return "/api/markup/highlight";
        case "underline":
        case "underline_pdf":
        case "underline-pdf":
            return "/api/markup/underline";
        case "strikeout":
        case "strikeout_pdf":
        case "strikeout-pdf":
        case "strike_pdf":
        case "strike-pdf":
        case "strikethrough":
        case "strikethrough_pdf":
        case "strikethrough-pdf":
            return "/api/markup/strikeout";
        case "sign":
        case "sign_pdf":
        case "sign-pdf":
            return "/api/structure/sign";
        case "repair":
        case "repair_pdf":
        case "repair-pdf":
        case "structure_repair":
            return "/api/structure/repair";
        case "code_to_pdf":
        case "code-to-pdf":
        case "code":
            return "/api/conversion/code-to-pdf";
        case "markdown_to_pdf":
        case "markdown-to-pdf":
        case "md_to_pdf":
        case "md-to-pdf":
        case "markdown":
            return "/api/conversion/markdown-to-pdf";
        default:
            return `/api/structure/${tool}`;
    }
}
