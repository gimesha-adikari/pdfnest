import Link from "next/link";
import {
    ShieldCheck,
    Lock,
    FileLock2,
    TriangleAlert,
    Bug,
    Calendar,
    CheckCircle2,
    Clock3,
    Shield,
} from "lucide-react";

export const metadata = {
    title: "Security | Platen PDF",
    description: "Security information for Platen PDF.",
};

export default function SecurityPage() {
    return (
        <main className="mx-auto max-w-6xl px-6 py-16">
            {/* Hero */}

            <div className="mb-14">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-500">
                    <ShieldCheck className="h-4 w-4" />
                    Security Center
                </div>

                <h1 className="mt-6 text-5xl font-black tracking-tight text-[color:var(--foreground)]">
                    Security is built into every document.
                </h1>

                <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--muted-foreground)]">
                    We design Platen PDF with security in mind—from encrypted
                    connections and secure authentication to automatic file
                    deletion and continuous infrastructure protection.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-2 text-sm">
                        <Calendar className="h-4 w-4 text-indigo-500" />
                        Effective July 31, 2026
                    </div>
                </div>
            </div>

            {/* Security at a Glance */}

            <section className="mb-10">
                <h2 className="mb-6 text-2xl font-black">
                    Security at a Glance
                </h2>

                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        {
                            icon: Lock,
                            color: "text-indigo-500",
                            title: "HTTPS Encryption",
                            text: "All communication is encrypted in transit.",
                        },
                        {
                            icon: Clock3,
                            color: "text-emerald-500",
                            title: "Auto File Deletion",
                            text: "Files are removed within 30 minutes after processing.",
                        },
                        {
                            icon: Shield,
                            color: "text-orange-500",
                            title: "Secure Authentication",
                            text: "Protected login and account security controls.",
                        },
                        {
                            icon: ShieldCheck,
                            color: "text-sky-500",
                            title: "Continuous Protection",
                            text: "Monitoring and infrastructure safeguards.",
                        },
                    ].map((item) => (
                        <div
                            key={item.title}
                            className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
                        >
                            <item.icon className={`h-8 w-8 ${item.color}`} />

                            <h3 className="mt-5 font-bold text-lg">
                                {item.title}
                            </h3>

                            <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                                {item.text}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Intro */}

            <div className="mb-10 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-8">
                <p className="leading-8 text-[color:var(--muted-foreground)]">
                    Protecting your files and account is one of our highest
                    priorities. We continuously improve our security controls
                    and infrastructure to help keep your data safe while
                    delivering a fast document processing experience.
                </p>
            </div>

            <div className="space-y-8">

                {/* Measures */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-8 flex items-center gap-3">
                        <Lock className="h-6 w-6 text-indigo-500" />
                        <h2 className="text-2xl font-black">
                            Security Measures
                        </h2>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                        {[
                            "HTTPS encryption for all communications",
                            "Secure authentication and account protection",
                            "Role-based access controls",
                            "Infrastructure monitoring and logging",
                            "Protection against abuse and malicious activity",
                            "Temporary file storage only when necessary",
                            "Automatic file deletion after processing",
                            "Continuous security improvements",
                        ].map((item) => (
                            <div
                                key={item}
                                className="flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-5"
                            >
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />

                                <span className="text-sm leading-7 text-[color:var(--muted-foreground)]">
                                    {item}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* File Handling */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-8 flex items-center gap-3">
                        <FileLock2 className="h-6 w-6 text-sky-500" />
                        <h2 className="text-2xl font-black">
                            File Handling
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        Uploaded and generated files are intended to be
                        temporary. Unless a shorter retention period applies,
                        files are automatically deleted within
                        <strong> 30 minutes </strong>
                        after processing.
                    </p>

                    <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                        <div className="flex items-start gap-3">
                            <ShieldCheck className="mt-1 h-6 w-6 text-emerald-500" />

                            <div>
                                <h3 className="font-bold">
                                    Privacy by Design
                                </h3>

                                <p className="mt-2 leading-7 text-[color:var(--muted-foreground)]">
                                    We retain uploaded files only for as long
                                    as necessary to process your request and
                                    deliver the resulting document.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Security Disclaimer */}

                <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-8">
                    <div className="mb-8 flex items-center gap-3">
                        <TriangleAlert className="h-6 w-6 text-amber-500" />
                        <h2 className="text-2xl font-black">
                            Security Disclaimer
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        While we follow industry best practices and continually
                        improve our security controls, no internet service or
                        software platform can guarantee absolute protection
                        against every possible attack, hardware failure, or
                        security incident.
                    </p>
                </section>

                {/* Report */}

                <section className="rounded-3xl border border-red-500/20 bg-red-500/5 p-8">
                    <div className="mb-8 flex items-center gap-3">
                        <Bug className="h-6 w-6 text-red-500" />
                        <h2 className="text-2xl font-black">
                            Report a Security Issue
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        If you discover a security vulnerability, suspect
                        unauthorized access, or notice suspicious behavior,
                        please let us know immediately. Responsible disclosure
                        helps us protect everyone using Platen PDF.
                    </p>

                    <Link
                        href="mailto:support@yourdomain.com"
                        className="mt-8 inline-flex items-center rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white transition hover:bg-indigo-600"
                    >
                        Report a Security Issue
                    </Link>
                </section>

                {/* Updates */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <h2 className="mb-6 text-2xl font-black">
                        Changes to This Page
                    </h2>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        As our infrastructure, security practices, and services
                        evolve, we may update this page to reflect new
                        protections, operational improvements, or legal
                        requirements. The latest version will always be
                        published here.
                    </p>
                </section>

            </div>
        </main>
    );
}