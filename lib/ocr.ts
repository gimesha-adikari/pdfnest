import { getBaseUrl } from "@/lib/api";

export interface OCRLanguage {
    code: string;
    name: string;
}

export interface OCRLanguagesResponse {
    default: string;
    languages: OCRLanguage[];
}

export async function getOCRLanguages(): Promise<OCRLanguagesResponse> {
    const response = await fetch(`${getBaseUrl()}/api/ocr/languages`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error("Unable to load OCR languages.");
    }

    return response.json();
}