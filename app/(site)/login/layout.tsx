import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = buildNoIndexMetadata({
    title: "Log in",
    canonical: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
