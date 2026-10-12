import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const PASSWORD_ALPHA = "platen-m1-user-alpha";
const OWNER_ALPHA = "platen-m1-owner-alpha";
const PASSWORD_BETA = "platen-m1-user-beta";
const OWNER_BETA = "platen-m1-owner-beta";
const ALPHA_MARKER = "PLATEN_M1_SYNTHETIC_ALPHA";
const BETA_MARKER = "PLATEN_M1_SYNTHETIC_BETA";
const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

function outputDirectory(): string {
    const args = process.argv.slice(2);
    const optionIndex = args.indexOf("--out-dir");
    if (optionIndex >= 0) {
        const selected = args[optionIndex + 1];
        if (!selected) throw new Error("--out-dir requires a path.");
        return path.resolve(selected);
    }
    return path.join(os.tmpdir(), "platen-m1-security-fixtures");
}

function run(command: string, args: string[]): string {
    try {
        return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
    }
}

function runExpectedFailure(command: string, args: string[]): void {
    const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.notEqual(result.status, 0, `${command} ${args.join(" ")} unexpectedly succeeded`);
}

function sha256(filePath: string): string {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function createPlainPdf(filePath: string): Promise<void> {
    const pdf = await PDFDocument.create();
    pdf.setTitle("Platen Milestone 1 synthetic fixture");
    pdf.setAuthor("Platen PDF security regression scaffold");
    pdf.setCreator("tests/security/milestone-1/generate-fixtures.ts");
    pdf.setCreationDate(FIXED_DATE);
    pdf.setModificationDate(FIXED_DATE);
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    const first = pdf.addPage([612, 792]);
    first.drawText(ALPHA_MARKER, { x: 54, y: 720, size: 14, font });
    const second = pdf.addPage([792, 612]);
    second.drawText(BETA_MARKER, { x: 54, y: 540, size: 14, font });

    writeFileSync(filePath, await pdf.save({ useObjectStreams: false, addDefaultPage: false }));
}

function encryptPdf(source: string, destination: string, userPassword: string, ownerPassword: string): void {
    run("qpdf", [
        "--encrypt",
        userPassword,
        ownerPassword,
        "256",
        "--",
        source,
        destination,
    ]);
}

function verifyPdf(filePath: string, expectedPassword: string | undefined, markers: string[]): void {
    const passwordArgs = expectedPassword ? [`--password=${expectedPassword}`] : [];
    run("qpdf", [...passwordArgs, "--check", filePath]);

    const pdfInfo = expectedPassword
        ? run("pdfinfo", ["-upw", expectedPassword, filePath])
        : run("pdfinfo", [filePath]);
    assert.match(pdfInfo, /^Pages:\s+2\s*$/m, `${path.basename(filePath)} must contain two pages`);

    const extractedText = expectedPassword
        ? run("pdftotext", ["-upw", expectedPassword, filePath, "-"])
        : run("pdftotext", [filePath, "-"]);
    for (const marker of markers) {
        assert.ok(extractedText.includes(marker), `${path.basename(filePath)} is missing ${marker}`);
    }
}

async function main(): Promise<void> {
    const directory = outputDirectory();
    mkdirSync(directory, { recursive: true });

    const plain = path.join(directory, "plain-two-pages.pdf");
    const protectedAlpha = path.join(directory, "protected-alpha.pdf");
    const protectedBeta = path.join(directory, "protected-beta.pdf");
    const malformed = path.join(directory, "malformed.pdf");

    await createPlainPdf(plain);
    encryptPdf(plain, protectedAlpha, PASSWORD_ALPHA, OWNER_ALPHA);
    encryptPdf(plain, protectedBeta, PASSWORD_BETA, OWNER_BETA);
    writeFileSync(malformed, Buffer.from("%PDF-1.7\nPLATEN_M1_MALFORMED_SYNTHETIC_INPUT\n", "ascii"));

    verifyPdf(plain, undefined, [ALPHA_MARKER, BETA_MARKER]);
    verifyPdf(protectedAlpha, PASSWORD_ALPHA, [ALPHA_MARKER, BETA_MARKER]);
    verifyPdf(protectedBeta, PASSWORD_BETA, [ALPHA_MARKER, BETA_MARKER]);
    runExpectedFailure("qpdf", [`--password=${PASSWORD_ALPHA}-wrong`, "--check", protectedAlpha]);
    runExpectedFailure("qpdf", ["--check", malformed]);

    for (const [filePath, password] of [[protectedAlpha, PASSWORD_ALPHA], [protectedBeta, PASSWORD_BETA]] as const) {
        const info = run("pdfinfo", ["-upw", password, filePath]);
        assert.match(info, /^Encrypted:\s+yes\b/m, `${path.basename(filePath)} must be encrypted`);
    }

    const qpdfVersion = run("qpdf", ["--version"]).trim().split("\n")[0];
    const fixtures = [plain, protectedAlpha, protectedBeta, malformed].map((filePath) => ({
        file: path.basename(filePath),
        bytes: readFileSync(filePath).byteLength,
        sha256: sha256(filePath),
    }));

    console.log(JSON.stringify({
        outputDirectory: directory,
        qpdfVersion,
        fixtures,
        passwordCases: {
            alphaUserPassword: PASSWORD_ALPHA,
            alphaOwnerPassword: OWNER_ALPHA,
            betaUserPassword: PASSWORD_BETA,
            betaOwnerPassword: OWNER_BETA,
            invalidPasswordCase: `${PASSWORD_ALPHA}-wrong against protected-alpha.pdf`,
        },
        verification: "qpdf --check, pdfinfo, and pdftotext passed; wrong-password and malformed-input checks failed as expected",
    }, null, 2));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
