"use client";

interface RecoveryDialogProps {
    open: boolean;
    onResume: () => void;
    onDiscard: () => void;
}

export default function RecoveryDialog({
                                           open,
                                           onResume,
                                           onDiscard,
                                       }: RecoveryDialogProps) {
    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-[200] bg-black/60" />

            <div className="fixed inset-0 z-[201] flex items-center justify-center">
                <div className="w-full max-w-md rounded-3xl bg-[var(--card)] p-8 shadow-2xl">

                    <h2 className="text-xl font-bold">
                        Resume previous session?
                    </h2>

                    <p className="mt-3 text-sm text-[color:var(--muted)]">
                        We found a temporary Studio recovery created less than one hour ago.
                    </p>

                    <div className="mt-8 flex justify-end gap-3">

                        <button
                            onClick={onDiscard}
                            className="rounded-xl border px-5 py-2"
                        >
                            Discard
                        </button>

                        <button
                            onClick={onResume}
                            className="rounded-xl bg-indigo-600 px-5 py-2 font-semibold text-white"
                        >
                            Resume
                        </button>

                    </div>

                </div>
            </div>
        </>
    );
}