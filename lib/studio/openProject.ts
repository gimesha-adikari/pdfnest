import { unzipSync, strFromU8 } from "fflate";
import {decrypt, toArrayBuffer} from "./crypto";
import { StudioProject } from "./project";
import {StudioToolId} from "@/components/studio/ToolBar";

interface SnapshotManifest {
    fileName: string;
    currentPageIndex: number;
    pages: { id: string; pageNumber: number }[];
    fingerprint: string;
}

interface ProjectManifest {
    version: 1;
    savedAt: number;
    activeTool: StudioToolId;
    zoom: number;
    current: SnapshotManifest;
    past: SnapshotManifest[];
    future: SnapshotManifest[];
}

function uint8Slice(bytes: Uint8Array, start: number, end: number) {
    return bytes.slice(start, end);
}

function toFile(bytes: Uint8Array, name: string) {
    return new File(
        [toArrayBuffer(bytes)],
        name,
        {
            type: "application/pdf",
        }
    );
}

export async function openProject(file: File): Promise<StudioProject> {
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (bytes.length < 32) {
        throw new Error("Invalid Studio project file.");
    }

    const magic = new TextDecoder().decode(uint8Slice(bytes, 0, 4));
    if (magic !== "PNS1") {
        throw new Error("Invalid project format.");
    }

    const salt = uint8Slice(bytes, 4, 20);
    const iv = uint8Slice(bytes, 20, 32);
    const encrypted = uint8Slice(bytes, 32, bytes.length);

    const zipBytes = await decrypt(encrypted, iv, salt);
    const archive = unzipSync(zipBytes);

    const manifestBytes = archive["manifest.json"];
    if (!manifestBytes) {
        throw new Error("Project manifest is missing.");
    }

    const manifest = JSON.parse(strFromU8(manifestBytes)) as ProjectManifest;

    const buildSnapshot = (meta: SnapshotManifest, path: string) => {
        const pdfBytes = archive[path];
        if (!pdfBytes) {
            throw new Error(`Missing snapshot file: ${path}`);
        }

        return {
            file: toFile(pdfBytes, meta.fileName),
            pages: meta.pages,
            currentPageIndex: meta.currentPageIndex,
            fingerprint: meta.fingerprint,
        };
    };

    return {
        version: manifest.version,
        savedAt: manifest.savedAt,
        activeTool: manifest.activeTool,
        zoom: manifest.zoom,
        current: buildSnapshot(manifest.current, "current/current.pdf"),
        past: manifest.past.map((meta, index) =>
            buildSnapshot(meta, `past/${index}.pdf`)
        ),
        future: manifest.future.map((meta, index) =>
            buildSnapshot(meta, `future/${index}.pdf`)
        ),
    };
}