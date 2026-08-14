import { NextRequest, NextResponse } from "next/server";
import {getBaseUrl} from "@/lib/api";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

// The backend expects the lock configuration as a flat `key:value, key:value`
// string, so a password containing a separator would be parsed as extra
// configuration fields (e.g. `mode:decrypt`).
const PASSWORD_SEPARATORS = /[,\r\n\u0000]/;

function sanitizeDownloadName(name: string): string {
    const base = name.split(/[/\\]/).pop() || "";
    const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned || "document.pdf";
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        const password = formData.get("password");

        if (!(file instanceof File) || typeof password !== "string" || !password) {
            return NextResponse.json({ error: "Missing file or password" }, { status: 400 });
        }

        if (file.size === 0 || file.size > MAX_FILE_BYTES) {
            return NextResponse.json(
                { error: "File payload exceeds maximum platform allowance of 50MB." },
                { status: 413 }
            );
        }

        if (PASSWORD_SEPARATORS.test(password)) {
            return NextResponse.json(
                { error: "Password cannot contain commas or line breaks." },
                { status: 400 }
            );
        }

        const backendFormData = new FormData();
        backendFormData.append("file", file);

        const configurationDescription = `upw:${password}, opw:${password}, mode:encrypt, algo:aes256`;
        backendFormData.append("description", configurationDescription);

        const response = await fetch(`${getBaseUrl()}/api/security/lock`, {
            method: "POST",
            body: backendFormData,
        });

        if (!response.ok) {
            console.error(
                `Backend lock request failed (${response.status}):`,
                await response.text().catch(() => "")
            );
            return NextResponse.json(
                { error: "Failed to lock the document." },
                { status: 502 }
            );
        }

        const securedPdfBytes = await response.arrayBuffer();

        return new Response(securedPdfBytes, {
            headers: {
                "Content-Type": "application/pdf",
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": `attachment; filename="locked-${sanitizeDownloadName(file.name)}"`,
            },
        });
    } catch (error: unknown) {
        console.error("Lock route failure:", error);

        return NextResponse.json({ error: "Failed to lock the document." }, { status: 500 });
    }
}
