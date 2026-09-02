import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata();

export default function BillingLayout({ children }: { children: React.ReactNode }) {
    return children;
}
