import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = {
    ...buildNoIndexMetadata(),
    title: "PDF Tools | Platen PDF",
    description: "Access Platen PDF tools for editing, converting and organizing documents.",
};

export default function SubscribeLayout({
                                            children,
                                        }: {
    children: React.ReactNode;
}) {
    return children;
}
