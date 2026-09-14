import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata({
    title: "Forgot password",
    canonical: "/forgot-password",
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
    return children;
}
