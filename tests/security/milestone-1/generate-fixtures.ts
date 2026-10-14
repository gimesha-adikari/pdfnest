import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { encrypt } from "../../../lib/studio/crypto";

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

async function createDistinctPlainPdf(filePath: string, marker: string): Promise<void> {
    const pdf = await PDFDocument.create();
    pdf.setTitle("Platen Milestone 1 distinct preview fixture");
    pdf.setAuthor("Platen PDF security regression scaffold");
    pdf.setCreator("tests/security/milestone-1/generate-fixtures.ts");
    pdf.setCreationDate(FIXED_DATE);
    pdf.setModificationDate(FIXED_DATE);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([612, 792]);
    page.drawText(marker, { x: 54, y: 720, size: 14, font });
    writeFileSync(filePath, await pdf.save({ useObjectStreams: false, addDefaultPage: false }));
}

async function createScannedPdf(filePath: string): Promise<void> {
    const pdf = await PDFDocument.create();
    pdf.setTitle("Platen Milestone 1 synthetic scanned fixture");
    pdf.setAuthor("Platen PDF security regression scaffold");
    pdf.setCreator("tests/security/milestone-1/generate-fixtures.ts");
    pdf.setCreationDate(FIXED_DATE);
    pdf.setModificationDate(FIXED_DATE);
    const scanImage = await pdf.embedPng(Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=",
        "base64"
    ));
    const page = pdf.addPage([612, 792]);
    page.drawImage(scanImage, { x: 0, y: 0, width: 612, height: 792 });
    writeFileSync(filePath, await pdf.save({ useObjectStreams: false, addDefaultPage: false }));
}

function encryptPdf(
    source: string,
    destination: string,
    userPassword: string,
    ownerPassword: string,
    keyLength = 256,
): void {
    run("qpdf", [
        "--encrypt",
        userPassword,
        ownerPassword,
        String(keyLength),
        ...(keyLength === 128 ? ["--use-aes=y"] : []),
        "--",
        source,
        destination,
    ]);
}

function verifyPdf(
    filePath: string,
    expectedPassword: string | undefined,
    markers: string[],
    expectedPageCount = 2,
): void {
    const passwordArgs = expectedPassword ? [`--password=${expectedPassword}`] : [];
    run("qpdf", [...passwordArgs, "--check", filePath]);

    const pdfInfo = expectedPassword
        ? run("pdfinfo", ["-upw", expectedPassword, filePath])
        : run("pdfinfo", [filePath]);
    assert.match(
        pdfInfo,
        new RegExp(`^Pages:\\s+${expectedPageCount}\\s*$`, "m"),
        `${path.basename(filePath)} must contain ${expectedPageCount} page(s)`,
    );

    const extractedText = expectedPassword
        ? run("pdftotext", ["-upw", expectedPassword, filePath, "-"])
        : run("pdftotext", [filePath, "-"]);
    for (const marker of markers) {
        assert.ok(extractedText.includes(marker), `${path.basename(filePath)} is missing ${marker}`);
    }
}

async function createStudioProject(
    filePath: string,
    currentPdfPath: string,
    historyPdfPaths: string[],
    futurePdfPaths: string[] = [],
    options: { manifestPageCount?: number; currentPageIndex?: number } = {},
): Promise<void> {
    const archive: Record<string, Uint8Array> = {};
    const manifestPageCount = options.manifestPageCount ?? 1;
    const pages = Array.from({ length: manifestPageCount }, (_, index) => ({
        id: `synthetic-studio-page-${index + 1}`,
        pageNumber: index + 1,
    }));
    archive["manifest.json"] = strToU8(JSON.stringify({
        version: 1,
        savedAt: FIXED_DATE.getTime(),
        activeTool: "select",
        zoom: 1,
        current: {
            fileName: path.basename(currentPdfPath),
            currentPageIndex: options.currentPageIndex ?? 0,
            pages,
            fingerprint: "synthetic-current-snapshot",
        },
        past: historyPdfPaths.map((historyPath, index) => ({
            fileName: path.basename(historyPath),
            currentPageIndex: 0,
            pages,
            fingerprint: `synthetic-past-snapshot-${index + 1}`,
        })),
        future: futurePdfPaths.map((futurePath, index) => ({
            fileName: path.basename(futurePath),
            currentPageIndex: 0,
            pages,
            fingerprint: `synthetic-future-snapshot-${index + 1}`,
        })),
    }));
    archive["current/current.pdf"] = new Uint8Array(readFileSync(currentPdfPath));
    for (let index = 0; index < historyPdfPaths.length; index += 1) {
        archive[`past/${index}.pdf`] = new Uint8Array(readFileSync(historyPdfPaths[index]));
    }
    for (let index = 0; index < futurePdfPaths.length; index += 1) {
        archive[`future/${index}.pdf`] = new Uint8Array(readFileSync(futurePdfPaths[index]));
    }

    const zipped = zipSync(archive, { level: 9 });
    const encrypted = await encrypt(zipped);
    const container = new Uint8Array(32 + encrypted.encrypted.length);
    container.set([0x50, 0x4e, 0x53, 0x31], 0);
    container.set(encrypted.salt, 4);
    container.set(encrypted.iv, 20);
    container.set(encrypted.encrypted, 32);
    writeFileSync(filePath, container);
}

async function main(): Promise<void> {
    const directory = outputDirectory();
    mkdirSync(directory, { recursive: true });

    const plain = path.join(directory, "plain-two-pages.pdf");
    const protectedAlpha = path.join(directory, "protected-alpha.pdf");
    const protectedBeta = path.join(directory, "protected-beta.pdf");
    const protectedLockOutput = path.join(directory, "protected-lock-output-aes128.pdf");
    const malformed = path.join(directory, "malformed.pdf");
    const scanned = path.join(directory, "scanned-image-only.pdf");
    const protectedScanned = path.join(directory, "protected-scanned.pdf");
    const distinctPlain = path.join(directory, "plain-preview-future.pdf");
    const legacyStudioPreviewHistoryProject = path.join(directory, "legacy-studio-preview-history.pns");
    const legacyStudioPreviewInvalidPageProject = path.join(directory, "legacy-studio-preview-invalid-page.pns");
    const legacyStudioProtectedProject = path.join(directory, "legacy-studio-protected.pns");
    const legacyStudioProtectedHistoryProject = path.join(directory, "legacy-studio-protected-history.pns");
    const legacyStudioProtectedFutureProject = path.join(directory, "legacy-studio-protected-future.pns");
    const legacyStudioPlainProject = path.join(directory, "legacy-studio-plain.pns");
    const legacyStudioAlternatePlainProject = path.join(directory, "legacy-studio-alternate-plain.pns");

    await createPlainPdf(plain);
    await createDistinctPlainPdf(distinctPlain, "PLATEN_M1_SYNTHETIC_PREVIEW_FUTURE");
    await createScannedPdf(scanned);
    encryptPdf(plain, protectedAlpha, PASSWORD_ALPHA, OWNER_ALPHA);
    encryptPdf(plain, protectedBeta, PASSWORD_BETA, OWNER_BETA);
    encryptPdf(plain, protectedLockOutput, PASSWORD_ALPHA, OWNER_ALPHA, 128);
    encryptPdf(scanned, protectedScanned, PASSWORD_ALPHA, OWNER_ALPHA);
    writeFileSync(malformed, Buffer.from("%PDF-1.7\nPLATEN_M1_MALFORMED_SYNTHETIC_INPUT\n", "ascii"));
    await createStudioProject(legacyStudioProtectedProject, protectedAlpha, [plain]);
    await createStudioProject(legacyStudioProtectedHistoryProject, plain, [protectedAlpha]);
    await createStudioProject(legacyStudioProtectedFutureProject, plain, [], [protectedAlpha]);
    await createStudioProject(legacyStudioPlainProject, plain, [plain], [plain]);
    await createStudioProject(legacyStudioAlternatePlainProject, scanned, [], []);
    await createStudioProject(legacyStudioPreviewHistoryProject, plain, [scanned], [distinctPlain]);
    // Deliberately inconsistent page metadata exercises a safe real-worker
    // rejection after session creation; the PDF bytes themselves remain valid.
    await createStudioProject(
        legacyStudioPreviewInvalidPageProject,
        plain,
        [],
        [],
        { manifestPageCount: 3, currentPageIndex: 2 },
    );

    verifyPdf(plain, undefined, [ALPHA_MARKER, BETA_MARKER]);
    verifyPdf(distinctPlain, undefined, ["PLATEN_M1_SYNTHETIC_PREVIEW_FUTURE"], 1);
    verifyPdf(protectedAlpha, PASSWORD_ALPHA, [ALPHA_MARKER, BETA_MARKER]);
    verifyPdf(protectedBeta, PASSWORD_BETA, [ALPHA_MARKER, BETA_MARKER]);
    verifyPdf(protectedLockOutput, PASSWORD_ALPHA, [ALPHA_MARKER, BETA_MARKER]);
    assert.match(
        run("pdfinfo", ["-upw", PASSWORD_ALPHA, protectedLockOutput]),
        /^Encrypted:\s+yes\b.*algorithm:AES\)\s*$/m,
        "the backend-compatible re-lock fixture must be AES-encrypted and readable with the expected password"
    );
    assert.match(
        run("qpdf", [`--password=${PASSWORD_ALPHA}`, "--show-encryption", protectedLockOutput]),
        /stream encryption method: AESv2\b/,
        "the backend-compatible fixture must use PDF AES-128 (AESv2), not RC4 or AES-256"
    );
    run("qpdf", ["--check", scanned]);
    run("qpdf", [`--password=${PASSWORD_ALPHA}`, "--check", protectedScanned]);
    assert.match(run("pdfinfo", ["-upw", PASSWORD_ALPHA, protectedScanned]), /^Pages:\s+1\s*$/m);
    assert.match(run("pdfinfo", ["-upw", PASSWORD_ALPHA, protectedScanned]), /^Encrypted:\s+yes\b/m);
    assert.equal(
        run("pdftotext", ["-upw", PASSWORD_ALPHA, protectedScanned, "-"]).trim(),
        "",
        "the protected scanned fixture must have no native text layer"
    );
    runExpectedFailure("qpdf", [`--password=${PASSWORD_ALPHA}-wrong`, "--check", protectedAlpha]);
    runExpectedFailure("qpdf", ["--check", malformed]);

    for (const [filePath, password] of [[protectedAlpha, PASSWORD_ALPHA], [protectedBeta, PASSWORD_BETA]] as const) {
        const info = run("pdfinfo", ["-upw", password, filePath]);
        assert.match(info, /^Encrypted:\s+yes\b/m, `${path.basename(filePath)} must be encrypted`);
    }

    const qpdfVersion = run("qpdf", ["--version"]).trim().split("\n")[0];
    const fixtures = [plain, distinctPlain, protectedAlpha, protectedBeta, protectedLockOutput, scanned, protectedScanned, malformed, legacyStudioProtectedProject, legacyStudioProtectedHistoryProject, legacyStudioProtectedFutureProject, legacyStudioPlainProject, legacyStudioAlternatePlainProject, legacyStudioPreviewHistoryProject, legacyStudioPreviewInvalidPageProject].map((filePath) => ({
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
            backendLockOutputUserPassword: PASSWORD_ALPHA,
            backendLockOutputKeyLengthBits: 128,
            protectedScannedUserPassword: PASSWORD_ALPHA,
            invalidPasswordCase: `${PASSWORD_ALPHA}-wrong against protected-alpha.pdf`,
        },
        verification: "qpdf --check, pdfinfo, and pdftotext passed; wrong-password and malformed-input checks failed as expected",
    }, null, 2));
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
