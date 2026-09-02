import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata({
    title: "Create an account",
    canonical: "/register",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return children;
}
