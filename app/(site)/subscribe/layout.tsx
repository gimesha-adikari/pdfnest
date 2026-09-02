import type { Metadata } from "next";
import { buildNoIndexMetadata } from "@/lib/seoMetadata";

export const metadata: Metadata = {
    ...buildNoIndexMetadata(),
    title: "Pricing | Platen PDF",
    description: "Compare Platen PDF plans.",
};

export default function SubscribeLayout({
                                            children,
                                        }: {
    children: React.ReactNode;
}) {
    return children;
}
