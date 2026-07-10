import { StudioAutoSave } from "./saveTypes";
import { clearItem, getItem, saveItem } from "./indexeddb";

const ONE_HOUR = 1000 * 60 * 60;

export async function saveStudioSession(data: StudioAutoSave) {
    await saveItem(data);
}

export async function loadStudioSession() {
    const save = await getItem<StudioAutoSave>();

    if (!save) return null;

    if (Date.now() - save.savedAt > ONE_HOUR) {
        await clearItem();
        return null;
    }

    return save;
}

export async function deleteStudioSession() {
    await clearItem();
}