import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";
import DashboardAuthGuard from "@/components/dashboard/DashboardAuthGuard";

export const metadata: Metadata = buildNoIndexMetadata();

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return <DashboardAuthGuard>{children}</DashboardAuthGuard>;
}
