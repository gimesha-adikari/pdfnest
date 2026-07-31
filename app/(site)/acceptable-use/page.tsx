import Link from "next/link";
import {
    ShieldAlert,
    Ban,
    FileWarning,
    Gavel,
    Mail,
    Calendar,
    ChevronRight,
} from "lucide-react";

export const metadata = {
    title: "Acceptable Use Policy | Platen PDF",
    description: "Acceptable Use Policy for Platen PDF.",
};

export default function AcceptableUsePage() {
    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            {/* Hero */}

            <div className="mb-14">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-sm font-semibold text-amber-500">
                    <ShieldAlert className="h-4 w-4" />
                    Acceptable Use Policy
                </div>

                <h1 className="mt-6 text-5xl font-black tracking-tight text-[color:var(--foreground)]">
                    Keep Platen PDF safe for everyone.
                </h1>

                <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--muted-foreground)]">
                    This policy explains the activities that are prohibited when
                    using Platen PDF. These rules help us protect our users,
                    infrastructure, and services.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-2 text-sm">
                        <Calendar className="h-4 w-4 text-indigo-500" />
                        Effective July 31, 2026
                    </div>
                </div>
            </div>

            {/* Intro */}

            <div className="mb-10 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-8">
                <p className="leading-8 text-[color:var(--muted-foreground)]">
                    By using Platen PDF, you agree to use the Service
                    responsibly. Activities that threaten security, violate
                    laws, abuse our infrastructure, or negatively affect other
                    users are prohibited.
                </p>
            </div>

            {/* Sections */}

            <div className="space-y-8">

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Ban className="h-6 w-6 text-red-500" />
                        <h2 className="text-2xl font-black">
                            Prohibited Uses
                        </h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        {[
                            "Violate any law or regulation",
                            "Upload or process illegal content",
                            "Infringe copyrights, trademarks, or other intellectual property",
                            "Upload malware, ransomware, or malicious code",
                            "Attempt unauthorized access to systems or accounts",
                            "Probe, scan, or exploit security vulnerabilities",
                            "Interfere with service availability or stability",
                            "Use bots or automation to abuse limits",
                            "Circumvent security or usage restrictions",
                            "Impersonate another person or organization",
                            "Upload files you are not authorized to process",
                        ].map((item) => (
                            <div
                                key={item}
                                className="flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4"
                            >
                                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />

                                <span className="text-sm leading-7 text-[color:var(--muted-foreground)]">
                                    {item}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <FileWarning className="h-6 w-6 text-orange-500" />
                        <h2 className="text-2xl font-black">
                            Document & File Safety
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        Files uploaded to Platen PDF must not contain malicious
                        software or be designed to exploit vulnerabilities,
                        damage systems, or interfere with our infrastructure or
                        third-party services.
                    </p>
                </section>

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Gavel className="h-6 w-6 text-indigo-500" />
                        <h2 className="text-2xl font-black">
                            Enforcement
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        If we reasonably believe this policy has been violated,
                        we may investigate and take appropriate action,
                        including:
                    </p>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        {[
                            "Issue warnings",
                            "Temporarily restrict access",
                            "Suspend or terminate accounts",
                            "Refuse processing requests",
                            "Remove content where appropriate",
                            "Report unlawful activity when required",
                        ].map((item) => (
                            <div
                                key={item}
                                className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-5 py-4 text-sm font-medium"
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Mail className="h-6 w-6 text-emerald-500" />
                        <h2 className="text-2xl font-black">
                            Reporting Abuse
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        If you believe Platen PDF is being abused or used for
                        unlawful purposes, please report it to our support team.
                    </p>

                    <Link
                        href="mailto:support@yourdomain.com"
                        className="mt-6 inline-flex rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white transition hover:bg-indigo-600"
                    >
                        support@yourdomain.com
                    </Link>
                </section>

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <h2 className="mb-5 text-2xl font-black">
                        Policy Updates
                    </h2>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        We may update this Acceptable Use Policy from time to
                        time as our services evolve. Updated versions become
                        effective when published on this page.
                    </p>
                </section>

            </div>
        </main>
    );
}