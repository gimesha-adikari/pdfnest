"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { CloudOff, ArrowLeft, Wifi } from "lucide-react";
import { type ToolPolicy } from "@/lib/execution/types";
import { useBackendHealth } from "@/context/BackendHealthContext";

interface BackendOnlyToolGuardProps {
    toolId: string;
    toolTitle?: string;
    toolPolicy?: ToolPolicy;
    children: ReactNode;
}

/**
 * Wraps a tool workspace. When the backend is offline and the tool requires
 * server-side processing (BACKEND_ONLY or SECURITY_CRITICAL_BACKEND), renders
 * a clear "Service Unavailable" UI instead of the upload form.
 *
 * Client-capable tools always pass through, regardless of backend status.
 */
export function BackendOnlyToolGuard({
    toolId,
    toolTitle,
    toolPolicy,
    children,
}: BackendOnlyToolGuardProps) {
    const { isAvailable } = useBackendHealth();

    const isBackendOnly =
        toolPolicy === "BACKEND_ONLY" || toolPolicy === "SECURITY_CRITICAL_BACKEND";

    // If tool is client-capable (or policy unknown) always render
    if (!isBackendOnly) return <>{children}</>;

    // Backend-only + backend offline → show unavailable state
    if (!isAvailable) {
        return <BackendUnavailableToolPage toolId={toolId} toolTitle={toolTitle} />;
    }

    return <>{children}</>;
}

function BackendUnavailableToolPage({
    toolId,
    toolTitle,
}: {
    toolId: string;
    toolTitle?: string;
}) {
    const displayName = toolTitle || toolId;

    return (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
            <div className="mx-auto max-w-md text-center">
                {/* Icon */}
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
                    <CloudOff size={28} className="text-amber-500" />
                </div>

                {/* Heading */}
                <h1 className="text-2xl font-black tracking-tight text-[color:var(--foreground)]">
                    Service Temporarily Unavailable
                </h1>

                {/* Description */}
                <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--foreground)]">
                        {displayName}
                    </span>{" "}
                    requires server-side processing and cannot run in your browser. The Platen
                    backend is currently unreachable.
                </p>

                {/* Status indicator */}
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    <Wifi size={13} />
                    Backend offline — cloud processing unavailable
                </div>

                {/* What you can do */}
                <div className="mt-8 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-5 text-left">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                        What you can do right now
                    </p>
                    <ul className="space-y-2 text-sm text-[color:var(--muted)]">
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-indigo-500">✓</span>
                            Browse{" "}
                            <Link href="/tools" className="font-semibold text-indigo-500 hover:underline">
                                client-capable tools
                            </Link>{" "}
                            that work fully in your browser
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-indigo-500">✓</span>
                            Come back later when the service is restored
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-indigo-500">✓</span>
                            Try{" "}
                            <Link href="/merge-pdf" className="font-semibold text-indigo-500 hover:underline">
                                Merge
                            </Link>
                            ,{" "}
                            <Link href="/split-pdf" className="font-semibold text-indigo-500 hover:underline">
                                Split
                            </Link>
                            ,{" "}
                            <Link href="/rotate-pdf" className="font-semibold text-indigo-500 hover:underline">
                                Rotate
                            </Link>{" "}
                            and more — all fully offline
                        </li>
                    </ul>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link
                        href="/tools"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700"
                    >
                        Browse Available Tools
                    </Link>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-5 py-3 text-sm font-semibold text-[color:var(--foreground)] transition hover:border-indigo-500"
                    >
                        <ArrowLeft size={14} />
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
