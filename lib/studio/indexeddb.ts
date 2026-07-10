const DB_NAME = "pdfnest-studio";
const STORE_NAME = "autosave";
const KEY = "current";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);

        request.onerror = () => reject(request.error);
    });
}

export async function saveItem(value: unknown) {
    const db = await openDB();

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");

        tx.objectStore(STORE_NAME).put(value, KEY);

        tx.oncomplete = () => resolve();

        tx.onerror = () => reject(tx.error);
    });
}

export async function getItem<T>() {
    const db = await openDB();

    return new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME);

        const request = tx.objectStore(STORE_NAME).get(KEY);

        request.onsuccess = () => resolve(request.result ?? null);

        request.onerror = () => reject(request.error);
    });
}

export async function clearItem() {
    const db = await openDB();

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");

        tx.objectStore(STORE_NAME).delete(KEY);

        tx.oncomplete = () => resolve();

        tx.onerror = () => reject(tx.error);
    });
}