"use client";

interface RestoreCloudPreviewDialogProps {
    stage: "inspecting" | "consent";
    onAuthorize?: () => void;
    onCancel: () => void;
}

export default function RestoreCloudPreviewDialog({
    stage,
    onAuthorize,
    onCancel,
}: RestoreCloudPreviewDialogProps) {
    const inspecting = stage === "inspecting";

    return (
        <>
            <div className="fixed inset-0 z-[220] bg-black/60" />
            <div className="fixed inset-0 z-[221] flex items-center justify-center p-4">
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="studio-restore-preview-title"
                    aria-busy={inspecting}
                    className="w-full max-w-xl rounded-3xl bg-[var(--card)] p-7 shadow-2xl"
                >
                    <h2 id="studio-restore-preview-title" className="text-xl font-bold">
                        {inspecting
                            ? "Opening restored Studio project"
                            : "Authorize Cloud preview for this restored project"}
                    </h2>

                    {inspecting ? (
                        <p className="mt-4 text-sm text-[color:var(--muted)]">
                            Checking the current document and saved history snapshots before asking for permission. No preview upload has started.
                        </p>
                    ) : (
                        <div className="mt-4 space-y-3 text-sm text-[color:var(--muted)]">
                            <p>Legacy Studio preview rendering uses Platen Cloud.</p>
                            <p>
                                Opening or navigating this project may upload the current PDF and its saved document-history snapshots for preview.
                            </p>
                            <p>
                                Project data does not preserve source-protection or earlier Device/Cloud execution history, so that history cannot be reconstructed here.
                            </p>
                            <p>
                                This authorization applies only to this inspected project or recovery in this browser session. It is not saved to the project or browser storage.
                            </p>
                        </div>
                    )}

                    <div className="mt-7 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-xl border border-[color:var(--border)] px-5 py-2 text-sm font-medium"
                        >
                            Cancel
                        </button>
                        {!inspecting && (
                            <button
                                type="button"
                                onClick={onAuthorize}
                                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
                            >
                                Authorize Cloud preview
                            </button>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}
