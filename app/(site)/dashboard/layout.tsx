import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata();

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return children;
}
