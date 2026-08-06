import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Pricing | Platen PDF",
    description: "Compare Platen PDF plans.",

    robots: {
        index: false,
        follow: true,
    },
};

export default function SubscribeLayout({
                                            children,
                                        }: {
    children: React.ReactNode;
}) {
    return children;
}