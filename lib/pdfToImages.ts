import JSZip from "jszip";
import { saveAs } from "file-saver";

export async function convertPdfToImages(
    file: File,
    format: "png" | "jpeg" = "png",
    selectedPages?: number[],
    scale: number = 2
) {
    const pdfjsLib = await import(
        "pdfjs-dist/legacy/build/pdf.mjs"
        );

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "/pdf.worker.mjs";

    const arrayBuffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
    }).promise;

    const zip = new JSZip();

    const pages =
        selectedPages && selectedPages.length > 0
            ? selectedPages
            : Array.from(
                { length: pdf.numPages },
                (_, i) => i + 1
            );

    for (const pageNumber of pages) {
        const page = await pdf.getPage(pageNumber);

        const viewport = page.getViewport({
            scale,
        });

        const canvas =
            document.createElement("canvas");

        const context =
            canvas.getContext("2d");

        if (!context) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: context,
            viewport,
        }).promise;

        const blob =
            await new Promise<Blob | null>(
                (resolve) =>
                    canvas.toBlob(
                        resolve,
                        format === "png"
                            ? "image/png"
                            : "image/jpeg",
                        0.95
                    )
            );

        if (!blob) continue;

        zip.file(
            `page-${pageNumber}.${format}`,
            blob
        );
    }

    const zipBlob =
        await zip.generateAsync({
            type: "blob",
        });

    saveAs(
        zipBlob,
        `${file.name.replace(
            /\.pdf$/i,
            ""
        )}-images.zip`
    );
}