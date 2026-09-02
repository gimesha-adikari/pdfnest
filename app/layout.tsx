import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/context/AuthContext";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { BackendHealthProvider } from "@/context/BackendHealthContext";
import { getSiteUrl } from "@/lib/siteUrl";

const SITE_URL = getSiteUrl();

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: "Platen PDF - Free PDF Tools Online",
        template: "%s | Platen PDF",
    },
    description: "Merge, split, rotate, convert PDFs and images directly in your browser for free.",
    verification: {
        google: "cqwXOOqo2LotVxmcp8Hgtahz0-pcYaZ4J15J_Yl7PvU",
    },
    applicationName: "Platen PDF",
    creator: "Platen",
    publisher: "Platen",
    category: "productivity",
    formatDetection: {
        email: false,
        address: false,
        telephone: false,
    },
    referrer: "origin-when-cross-origin",
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

    return (
        <html
            lang="en"
            data-theme="dark"
            data-scroll-behavior="smooth"
            suppressHydrationWarning
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased selection:bg-indigo-500/30`}
        >
        <body className="min-h-full overflow-x-hidden bg-[var(--background)] text-[var(--foreground)] font-sans transition-colors duration-200">
        <ThemeProvider>
            <GoogleOAuthProvider clientId={googleClientId}>
                <BackendHealthProvider>
                    <AuthProvider>
                        <WorkflowProvider>{children}</WorkflowProvider>
                    </AuthProvider>
                </BackendHealthProvider>
            </GoogleOAuthProvider>
        </ThemeProvider>
        </body>
        </html>
    );
}
