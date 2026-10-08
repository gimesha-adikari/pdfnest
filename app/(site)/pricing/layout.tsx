import type {Metadata} from "next";
import {buildNoIndexMetadata} from "@/lib/seoMetadata";

// The pricing alias remains available in normal mode, but must not be
// indexed while client-side free-mode policy redirects visitors to tools.
export const metadata: Metadata = {
    ...buildNoIndexMetadata(),
    title: "PDF Tools | Platen PDF",
    description: "Access Platen PDF tools for editing, converting and organizing documents.",
};

export default function PricingLayout({children}: {children: React.ReactNode}) {
    return children;
}
