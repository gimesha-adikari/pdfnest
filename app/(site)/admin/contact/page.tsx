"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ContactCenter from "@/components/admin/ContactCenter";

export default function AdminContactPage() {
    const { isAuthenticated, isLoading, user } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (isLoading) return;
        if (!isAuthenticated || user?.role !== "admin") {
            router.push("/");
        }
    }, [isLoading, isAuthenticated, user, router]);

    if (isLoading || !isAuthenticated || user?.role !== "admin") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return <ContactCenter />;
}