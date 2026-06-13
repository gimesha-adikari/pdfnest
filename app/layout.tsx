import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import "./globals.css";
import {ThemeProvider} from "@/components/ThemeProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GlobalNotifications from "@/components/ui/GlobalNotifications";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "PDFNest - Free PDF Tools Online",
    description: "Merge, split, rotate, convert PDFs and images directly in your browser for free.",
    keywords: [
        "PDF",
        "Merge PDF",
        "Split PDF",
        "Rotate PDF",
        "PDF to Images",
        "Images to PDF",
        "Free PDF Tools",
        "Online PDF Editor"
    ],
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            data-scroll-behavior="smooth"
            suppressHydrationWarning
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased selection:bg-indigo-500/30`}
        >
        <body className="min-h-full bg-[var(--background)] text-[var(--foreground)] font-sans transition-colors duration-200">
        <ThemeProvider>
            <div className="min-h-screen flex flex-col relative isolation-auto">
                <Header/>
                <main className="flex-1 w-full relative z-10">
                    <GlobalNotifications />
                    {children}
                </main>
                <Footer/>
            </div>
        </ThemeProvider>
        </body>
        </html>
    );
}