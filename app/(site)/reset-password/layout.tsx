import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata({
    title: "Reset password",
    canonical: "/reset-password",
});

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
    return children;
}
