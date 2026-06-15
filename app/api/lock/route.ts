import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const password = formData.get("password") as string;

        if (!file || !password) {
            return NextResponse.json({ error: "Missing file or password" }, { status: 400 });
        }

        const backendFormData = new FormData();
        backendFormData.append("file", file);

        const configurationDescription = `upw:${password}, opw:${password}, mode:encrypt, algo:aes256`;
        backendFormData.append("description", configurationDescription);

        const response = await fetch("http://localhost:8080/api/security/lock", {
            method: "POST",
            body: backendFormData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Backend security compilation runtime failure.");
        }

        const securedPdfBytes = await response.arrayBuffer();

        return new Response(securedPdfBytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="locked-${file.name}"`,
            },
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";

        return NextResponse.json({ error: message }, { status: 500 });
    }
}