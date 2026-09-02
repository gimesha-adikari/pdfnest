import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata({ canonical: null });

export default function ToolDownloadLayout({ children }: { children: React.ReactNode }) {
    return children;
}
