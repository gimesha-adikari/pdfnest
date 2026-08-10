export interface ToolTransferPayload {
    blob: Blob;
    fileName: string;
    mimeType?: string;
    sourceToolId?: string;
}

interface StoredToolTransfer {
    id: string;
    blob: Blob;
    fileName: string;
    mimeType: string;
    sourceToolId?: string;
    createdAt: number;
}

const DB_NAME = "platen-tool-transfers";
const STORE_NAME = "transfers";
const DB_VERSION = 1;
// Transfers are transient handoffs between tool workspaces, not persistent storage.
const TRANSFER_TTL_MS = 30 * 60 * 1000;

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function cleanupExpiredRecords(db: IDBDatabase) {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const now = Date.now();

    const allRecords = await new Promise<StoredToolTransfer[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result as StoredToolTransfer[]) || []);
        request.onerror = () => reject(request.error);
    });

    for (const record of allRecords) {
        if (now - record.createdAt > TRANSFER_TTL_MS) {
            store.delete(record.id);
        }
    }

    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function saveToolTransfer(payload: ToolTransferPayload): Promise<string> {
    const db = await openDb();
    try {
        await cleanupExpiredRecords(db);

        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `transfer_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const record: StoredToolTransfer = {
            id,
            blob: payload.blob,
            fileName: payload.fileName,
            mimeType: payload.mimeType || payload.blob.type || "application/pdf",
            sourceToolId: payload.sourceToolId,
            createdAt: Date.now(),
        };

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            store.put(record);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });

        return id;
    } finally {
        db.close();
    }
}

export async function loadToolTransfer(id: string): Promise<StoredToolTransfer | null> {
    const db = await openDb();
    try {
        const record = await new Promise<StoredToolTransfer | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result as StoredToolTransfer | undefined);
            request.onerror = () => reject(request.error);
        });

        if (!record) return null;

        if (Date.now() - record.createdAt > TRANSFER_TTL_MS) {
            await deleteToolTransfer(id);
            return null;
        }

        return record;
    } finally {
        db.close();
    }
}

export async function deleteToolTransfer(id: string): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            store.delete(id);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}
