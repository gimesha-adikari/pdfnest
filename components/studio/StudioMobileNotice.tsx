"use client";

import { MonitorSmartphone } from "lucide-react";

export default function StudioMobileNotice() {
    return (
        <div className="mb-4 lg:hidden">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-amber-500/15 p-2 text-amber-500">
                        <MonitorSmartphone size={20} />
                    </div>

                    <div>
                        <h3 className="font-semibold text-amber-400">
                            Desktop Recommended
                        </h3>

                        <p className="mt-1 text-sm text-[color:var(--muted)]">
                            Platen PDF Studio works on mobile devices, but for the
                            best editing experience we recommend using a desktop
                            or laptop. Some tools require a larger screen for
                            accurate page editing.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}