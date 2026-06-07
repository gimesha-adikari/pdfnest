import Link from "next/link";

export default function Footer() {
    return (
        <footer
            className="
            mt-auto
            border-t border-[color:var(--border)]
            bg-[var(--card)]
        "
        >
            <div className="mx-auto max-w-7xl px-6 py-10">

                <div className="grid gap-8 md:grid-cols-3">

                    <div>
                        <h3 className="font-bold text-lg">
                            PDFNest
                        </h3>

                        <p className="mt-2 text-sm text-[color:var(--muted)]">
                            Fast, privacy-friendly PDF tools that run directly
                            in your browser.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-semibold">
                            Tools
                        </h4>

                        <div className="mt-3 flex flex-col gap-2 text-sm">
                            <Link href="/merge-pdf">Merge PDF</Link>
                            <Link href="/split-pdf">Split PDF</Link>
                            <Link href="/rotate-pdf">Rotate PDF</Link>
                            <Link href="/images-to-pdf">Images to PDF</Link>
                            <Link href="/pdf-to-images">
                                PDF to Images
                            </Link>
                            <Link href="/delete-pages">Delete Pages</Link>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold">
                            Information
                        </h4>

                        <div className="mt-3 flex flex-col gap-2 text-sm">
                            <span>100% Browser Based</span>
                            <span>No Sign-Up Required</span>
                            <span>Privacy Friendly</span>
                        </div>
                    </div>

                </div>

                <div
                    className="
                    mt-8
                    border-t border-[color:var(--border)]
                    pt-6
                    text-center
                    text-sm
                    text-[color:var(--muted)]
                "
                >
                    © {new Date().getFullYear()} PDFNest. All rights reserved.
                </div>

            </div>
        </footer>
    );
}