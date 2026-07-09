import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/context/AuthContext";
import { GoogleOAuthProvider } from "@react-oauth/google";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "PDFNest - Free PDF Tools Online",
    description:
        "Merge, split, rotate, convert PDFs and images directly in your browser for free.",
    keywords: [
        "PDF",
        "Merge PDF",
        "Split PDF",
        "Rotate PDF",
        "PDF to Images",
        "Images to PDF",
        "Free PDF Tools",
        "Online PDF Editor",
    ],
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    const googleClientId =
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
        "238327273003-0e17tkoua8oeg8197v7n01iqs337pkh6.apps.googleusercontent.com";

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
                <AuthProvider>{children}</AuthProvider>
            </GoogleOAuthProvider>
        </ThemeProvider>
        </body>
        </html>
    );
}