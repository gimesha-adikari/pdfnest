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
            const blob = await uploadAndDownloadFile(endpoint, formData, onProgress);
            return blob;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Cloud execution rejected or failed.";
            throw new ExecutionError("CLOUD_FAILURE", message, err);
        }
    }
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
        default:
            return `/api/structure/${tool}`;
    }
}
