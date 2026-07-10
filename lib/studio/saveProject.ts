import { zipSync, strToU8 } from "fflate";
import { encrypt } from "./crypto";
import { StudioProject } from "./project";

async function fileToUint8(file: File) {
    return new Uint8Array(await file.arrayBuffer());
}

export async function saveProject(project: StudioProject) {
    const zip: Record<string, Uint8Array> = {};

    zip["manifest.json"] = strToU8(
        JSON.stringify({
            version: project.version,
            savedAt: project.savedAt,
            activeTool: project.activeTool,
            zoom: project.zoom,
            current: {
                fileName: project.current.file.name,
                currentPageIndex: project.current.currentPageIndex,
                pages: project.current.pages,
                fingerprint: project.current.fingerprint,
            },
            past: project.past.map((snapshot) => ({
                fileName: snapshot.file.name,
                currentPageIndex: snapshot.currentPageIndex,
                pages: snapshot.pages,
                fingerprint: snapshot.fingerprint,
            })),
            future: project.future.map((snapshot) => ({
                fileName: snapshot.file.name,
                currentPageIndex: snapshot.currentPageIndex,
                pages: snapshot.pages,
                fingerprint: snapshot.fingerprint,
            })),
        })
    );

    zip["current/current.pdf"] = await fileToUint8(project.current.file);

    for (let i = 0; i < project.past.length; i++) {
        zip[`past/${i}.pdf`] = await fileToUint8(project.past[i].file);
    }

    for (let i = 0; i < project.future.length; i++) {
        zip[`future/${i}.pdf`] = await fileToUint8(project.future[i].file);
    }

    const zipBytes = zipSync(zip, { level: 9 });
    const encrypted = await encrypt(zipBytes);

    const container = new Uint8Array(
        4 + encrypted.salt.length + encrypted.iv.length + encrypted.encrypted.length
    );

    container.set([0x50, 0x4e, 0x53, 0x31], 0); // PNS1
    container.set(encrypted.salt, 4);
    container.set(encrypted.iv, 20);
    container.set(encrypted.encrypted, 32);

    const blob = new Blob([container], {
        type: "application/x-pdfnest-project",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = project.current.file.name.replace(/\.pdf$/i, "") + ".pns";

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}