import { FILE_RETENTION_COPY } from "@/lib/fileRetentionCopy";

const removalCopy = FILE_RETENTION_COPY.studioSessionRemoval.toLowerCase();
if (!removalCopy.includes("schedules") || !removalCopy.includes("cleanup")) {
    throw new Error("Studio session removal must explain that storage cleanup is scheduled");
}
if (!removalCopy.includes("retention can delay physical deletion")) {
    throw new Error("Studio session removal must disclose provider retention delays");
}
if (removalCopy.includes("permanently delete") || removalCopy.includes("permanently remove")) {
    throw new Error("Studio session removal must not promise immediate physical erasure");
}

console.log("Studio deletion copy accurately describes deferred physical cleanup");
