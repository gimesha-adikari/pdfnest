"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ShieldCheck } from "lucide-react";

type PolicyConsentDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAccept: () => void;
};

export default function PolicyConsentDialog({
                                                open,
                                                onOpenChange,
                                                onAccept,
                                            }: PolicyConsentDialogProps) {
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!open) {
            setChecked(false);
        }
    }, [open]);

    if (!open) return null;

    const handleAccept = () => {
        if (!checked) return;
        onAccept();
        onOpenChange(false);
    };

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-lg rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="absolute right-4 top-4 rounded-full p-2 text-[color:var(--muted-foreground)] transition-colors hover:bg-[color:var(--border)] hover:text-[color:var(--foreground)]"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>

                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
                        <ShieldCheck size={22} />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-black tracking-tight text-[color:var(--foreground)]">
                            Before you continue
                        </h2>
                        <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                            Please read and accept our legal policies to create your account.
                        </p>
                    </div>
                </div>

                <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/70 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setChecked(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-[color:var(--border)] accent-indigo-500"
                        />
                        <span className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                            I agree to the{" "}
                            <Link
                                href="/terms"
                                target="_blank"
                                className="font-semibold text-indigo-500 hover:underline"
                            >
                                Terms of Service
                            </Link>{" "}
                            and{" "}
                            <Link
                                href="/privacy"
                                target="_blank"
                                className="font-semibold text-indigo-500 hover:underline"
                            >
                                Privacy Policy
                            </Link>
                            . I understand that uploaded files are processed automatically and deleted
                            according to the policy.
                        </span>
                    </label>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="inline-flex items-center justify-center rounded-xl border border-[color:var(--border)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--border)]"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleAccept}
                        disabled={!checked}
                        className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Agree & Continue
                    </button>
                </div>
            </div>
        </div>
    );
}