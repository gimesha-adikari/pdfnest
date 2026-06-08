import Link from "next/link";

export default function Footer() {
    return (
        <footer
            className="
                mt-auto
                border-t
                border-[color:var(--border)]
                bg-[var(--card)]
            "
        >
            <div className="mx-auto max-w-7xl px-6 py-12">
                <div className="grid gap-10 md:grid-cols-4">

                    {/* Brand */}
                    <div>
                        <h3 className="text-lg font-bold">
                            PDFNest
                        </h3>

                        <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                            Fast, privacy-friendly PDF tools
                            that run entirely in your browser.
                            No uploads. No sign-up.
                        </p>
                    </div>

                    {/* PDF Tools */}
                    <div>
                        <h4 className="font-semibold">
                            Tools
                        </h4>

                        <div className="mt-3 flex flex-col gap-2 text-sm">
                            <Link
                                href="/merge-pdf"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                Merge PDF
                            </Link>

                            <Link
                                href="/split-pdf"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                Split PDF
                            </Link>

                            <Link
                                href="/delete-pages"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                Delete Pages
                            </Link>

                            <Link
                                href="/reorder-pages"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                Reorder Pages
                            </Link>

                            <Link
                                href="/rotate-pdf"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                Rotate PDF
                            </Link>

                            <Link
                                href="/watermark-pdf"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                Watermark PDF
                            </Link>
                        </div>
                    </div>

                    {/* Convert */}
                    <div>
                        <h4 className="font-semibold">
                            Convert
                        </h4>

                        <div className="mt-3 flex flex-col gap-2 text-sm">
                            <Link
                                href="/images-to-pdf"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                Images → PDF
                            </Link>

                            <Link
                                href="/pdf-to-images"
                                className="hover:text-indigo-400 transition-colors"
                            >
                                PDF → Images
                            </Link>
                        </div>
                    </div>

                    {/* Information */}
                    <div>
                        <h4 className="font-semibold">
                            Information
                        </h4>

                        <div className="mt-3 flex flex-col gap-2 text-sm text-[color:var(--muted)]">
                            <span>100% Browser Based</span>
                            <span>No Sign-Up Required</span>
                            <span>Privacy Friendly</span>

                            <Link
                                href="/about"
                                className="mt-2 hover:text-indigo-400 transition-colors"
                            >
                                About PDFNest
                            </Link>
                        </div>
                    </div>
                </div>

                <div
                    className="
                        mt-10
                        border-t
                        border-[color:var(--border)]
                        pt-6
                        text-center
                        text-sm
                        text-[color:var(--muted)]
                    "
                >
                    © {new Date().getFullYear()} PDFNest.
                    All rights reserved.
                </div>
            </div>
        </footer>
    );
}