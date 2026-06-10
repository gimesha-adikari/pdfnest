import { PDFDocument } from "pdf-lib";

export interface PdfMetadataOptions {
    title: string;
    author: string;
    subject: string;
    keywords: string;
    creator: string;
    producer: string;
}

export async function extractPdfMetadata(file: File): Promise<PdfMetadataOptions> {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes);

    return {
        title: pdfDoc.getTitle() || "",
        author: pdfDoc.getAuthor() || "",
        subject: pdfDoc.getSubject() || "",
        keywords: pdfDoc.getKeywords() || "",
        creator: pdfDoc.getCreator() || "",
        producer: pdfDoc.getProducer() || "",
    };
}

export async function editPdfMetadata(file: File, options: PdfMetadataOptions): Promise<Blob> {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes);

    pdfDoc.setTitle(options.title);
    pdfDoc.setAuthor(options.author);
    pdfDoc.setSubject(options.subject);
    pdfDoc.setKeywords(options.keywords.split(",").map(k => k.trim()).filter(Boolean));
    pdfDoc.setCreator(options.creator);
    pdfDoc.setProducer(options.producer);

    const savedBytes = await pdfDoc.save();
    return new Blob([savedBytes], { type: "application/pdf" });
}