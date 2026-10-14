/**
 * Transient Cloud-preview authorization for Files restored from Legacy Studio
 * project and recovery data. Weak references keep the decision session-scoped
 * and prevent it from being serialized with a project or browser storage.
 */
export interface RestoredStudioPreviewScope {
    readonly identity: symbol;
}

const scopeByFile = new WeakMap<File, RestoredStudioPreviewScope>();
const filesByScope = new WeakMap<RestoredStudioPreviewScope, ReadonlySet<File>>();
const stateByScope = new WeakMap<RestoredStudioPreviewScope, "pending" | "authorized" | "revoked">();

export function createRestoredStudioPreviewScope(
    files: readonly File[],
): RestoredStudioPreviewScope {
    const distinctFiles = new Set(files);
    const scope: RestoredStudioPreviewScope = Object.freeze({ identity: Symbol("restored-studio-preview") });
    filesByScope.set(scope, distinctFiles);
    stateByScope.set(scope, "pending");

    for (const file of distinctFiles) {
        scopeByFile.set(file, scope);
    }

    return scope;
}

export function authorizeRestoredStudioPreview(scope: RestoredStudioPreviewScope): void {
    if (stateByScope.get(scope) !== "pending") {
        throw new Error("This restored Studio preview authorization is no longer current.");
    }

    for (const file of filesByScope.get(scope) ?? []) {
        if (scopeByFile.get(file) !== scope) {
            throw new Error("This restored Studio preview authorization is no longer current.");
        }
    }

    stateByScope.set(scope, "authorized");
}

export function revokeRestoredStudioPreview(scope: RestoredStudioPreviewScope): void {
    stateByScope.set(scope, "revoked");
}

export function isRestoredStudioPreviewRequired(file: File | null | undefined): boolean {
    return Boolean(file && scopeByFile.has(file));
}

export function isRestoredStudioPreviewAuthorized(file: File | null | undefined): boolean {
    if (!file) return false;
    const scope = scopeByFile.get(file);
    return !scope || stateByScope.get(scope) === "authorized";
}

export function assertRestoredStudioPreviewAuthorized(file: File): void {
    if (isRestoredStudioPreviewRequired(file) && !isRestoredStudioPreviewAuthorized(file)) {
        throw new Error("Cloud preview for this restored Studio project requires explicit Cloud preview authorization in this browser session.");
    }
}
