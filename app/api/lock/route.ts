import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, PDFName, PDFString, PDFDict, PDFNumber } from "pdf-lib";

function convertToRc4(key: Uint8Array, input: Uint8Array): Uint8Array {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key[i % key.length]) % 256;
        const t = s[i];
        s[i] = s[j];
        s[j] = t;
    }
    let i = 0;
    j = 0;
    const output = new Uint8Array(input.length);
    for (let y = 0; y < input.length; y++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        const t = s[i];
        s[i] = s[j];
        s[j] = t;
        output[y] = input[y] ^ s[(s[i] + s[j]) % 256];
    }
    return output;
}

function padPassword(password: string): Uint8Array {
    const pad = new Uint8Array([
        0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
        0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
    ]);
    const result = new Uint8Array(32);
    const len = Math.min(password.length, 32);
    for (let i = 0; i < len; i++) result[i] = password.charCodeAt(i);
    for (let i = len; i < 32; i++) result[i] = pad[i - len];
    return result;
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const password = formData.get("password") as string;

        if (!file || !password) {
            return NextResponse.json({ error: "Missing file or password" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);

        const padded = padPassword(password);
        const userKey = convertToRc4(padded, padded);

        const encryptDict = pdfDoc.context.obj({
            Filter: PDFName.of("Standard"),
            V: PDFNumber.of(1),
            R: PDFNumber.of(2),
            O: PDFString.of(Buffer.from(padded).toString("binary")),
            U: PDFString.of(Buffer.from(userKey).toString("binary")),
            P: PDFNumber.of(-4),
        });

        const encryptRef = pdfDoc.context.register(encryptDict);
        pdfDoc.catalog.set(PDFName.of("Encrypt"), encryptRef);

        const securedPdfBytes = await pdfDoc.save();

        return new Response(securedPdfBytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="locked-${file.name}"`,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}