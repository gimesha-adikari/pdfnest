import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata();

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return children;
}
