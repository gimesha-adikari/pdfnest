// Product copy, not a retention timer or a storage-deletion guarantee.
export const FILE_RETENTION_COPY = {
    summary: "Cloud file retention varies by tool. Studio session files and exports can remain after processing; cleanup may be delayed.",
    processing: "Cloud workflows use temporary processing files. Studio sessions can also retain source files, edits and snapshots while the session is active.",
    exports: "Some Studio exports can remain available for up to 24 hours, subject to session expiry. This is a download-access limit, not a physical-deletion deadline.",
    cleanup: "Cleanup follows each workflow's expiry and removal rules. Deletion failures may be retried, and storage-provider retention restrictions can delay physical deletion. Expired access or scheduled cleanup does not confirm physical erasure; no single deletion deadline applies to all workflows.",
} as const;
