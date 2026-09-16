"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { Loader2 } from "lucide-react";

interface DashboardAuthGuardProps {
    children: React.ReactNode;
}

export default function DashboardAuthGuard({ children }: DashboardAuthGuardProps) {
    const { isLoggedIn, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !isLoggedIn) {
            const targetPath = pathname || "/dashboard";
            const search = typeof window !== "undefined" ? window.location.search : "";
            const returnTo = safeRedirectPath(`${targetPath}${search}`);
            router.replace(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
        }
    }, [isLoading, isLoggedIn, pathname, router]);

    if (isLoading || !isLoggedIn) {
        return (
            <div
                className="min-h-screen flex items-center justify-center bg-[var(--background)]"
                aria-label="Checking authentication"
                aria-busy="true"
            >
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    return <>{children}</>;
}
