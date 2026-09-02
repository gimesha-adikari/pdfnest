import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata({
    title: "Verify email",
});

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
    return children;
}
