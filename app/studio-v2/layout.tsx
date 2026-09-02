import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata();

export default function StudioV2Layout({ children }: { children: React.ReactNode }) {
    return children;
}
