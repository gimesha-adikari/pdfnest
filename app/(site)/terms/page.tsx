import Link from "next/link";
import {
    FileText,
    CalendarDays,
    ShieldCheck,
    CircleAlert,
    HandCoins,
    Scale,
    TriangleAlert,
    BadgeInfo,
    Mail,
    ArrowRight,
    Clock3,
    LockKeyhole,
} from "lucide-react";

import { EmailButton } from "@/components/ui/EmailButton";
import { EMAILS, LEGAL_OPERATOR } from "@/lib/constants";

export const metadata = {
    title: "Terms of Service | Platen PDF",
    description: "Terms of Service for Platen PDF.",
};

function SectionCard({
                         icon: Icon,
                         title,
                         children,
                         accent = "indigo",
                     }: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
    accent?: "indigo" | "emerald" | "amber" | "rose" | "slate";
}) {
    const accentStyles: Record<
        typeof accent,
        { border: string; bg: string; icon: string }
    > = {
        indigo: {
            border: "border-indigo-500/20",
            bg: "bg-indigo-500/5",
            icon: "text-indigo-500",
        },
        emerald: {
            border: "border-emerald-500/20",
            bg: "bg-emerald-500/5",
            icon: "text-emerald-500",
        },
        amber: {
            border: "border-amber-500/20",
            bg: "bg-amber-500/5",
            icon: "text-amber-500",
        },
        rose: {
            border: "border-rose-500/20",
            bg: "bg-rose-500/5",
            icon: "text-rose-500",
        },
        slate: {
            border: "border-[color:var(--border)]",
            bg: "bg-[var(--card)]/40",
            icon: "text-[color:var(--foreground)]",
        },
    };

    const s = accentStyles[accent];

    return (
        <section
            className={`rounded-3xl border ${s.border} ${s.bg} p-8 shadow-sm`}
        >
            <div className="mb-6 flex items-center gap-3">
                <Icon className={`h-6 w-6 ${s.icon}`} />
                <h2 className="text-2xl font-black tracking-tight">{title}</h2>
            </div>
            <div className="space-y-4 text-[color:var(--muted)] leading-8">
                {children}
            </div>
        </section>
    );
}

function ContactChip({
                         href,
                         label,
                         email,
                     }: {
    href: string;
    label: string;
    email: string;
}) {
    return (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                {label}
            </div>
            <EmailButton
                email={email}
                className="mt-3 inline-flex w-full items-center justify-between rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[color:var(--foreground)] transition hover:border-indigo-500 hover:text-indigo-500"
                copyMessage={`${label} copied to clipboard`}
            >
                <span>{email}</span>
                <Mail className="h-4 w-4" />
            </EmailButton>

            <Link
                href={href}
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-indigo-500 hover:underline"
            >
                Open contact page
                <ArrowRight className="h-4 w-4" />
            </Link>
        </div>
    );
}

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-[color:var(--background)] px-4 py-16 text-[color:var(--foreground)] sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                {/* Hero */}
                <section className="mb-14">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-400">
                        <Scale className="h-3.5 w-3.5" />
                        Legal
                    </div>

                    <div className="mt-6 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
                        <div>
                            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
                                <span className="block">Terms of</span>
                                <span className="block bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                                    Service
                                </span>
                            </h1>

                            <p className="mt-6 max-w-3xl text-base leading-8 text-[color:var(--muted)] md:text-lg">
                                These Terms of Service govern your access to and use of Platen PDF,
                                operated by {LEGAL_OPERATOR.legalName}, trading as {LEGAL_OPERATOR.tradingAs}, located at {LEGAL_OPERATOR.fullAddress}.
                            </p>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <Link
                                    href="/contact"
                                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                                >
                                    <Mail className="h-4 w-4" />
                                    Contact Platen PDF
                                </Link>

                                <Link
                                    href="/privacy"
                                    className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)]/40 px-5 py-3 text-sm font-semibold transition hover:border-indigo-500 hover:text-indigo-500"
                                >
                                    Privacy Policy
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-6 shadow-sm">
                            <div className="flex items-center gap-3">
                                <CalendarDays className="h-6 w-6 text-indigo-500" />
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                        Effective Date
                                    </p>
                                    <p className="mt-1 text-lg font-bold">
                                        July 31, 2026
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 space-y-3">
                                <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4">
                                    <LockKeyhole className="mt-0.5 h-5 w-5 text-emerald-500" />
                                    <div>
                                        <p className="font-semibold">File privacy</p>
                                        <p className="text-sm text-[color:var(--muted)]">
                                            Uploaded and generated files are deleted after processing.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4">
                                    <BadgeInfo className="mt-0.5 h-5 w-5 text-indigo-500" />
                                    <div>
                                        <p className="font-semibold">AI-assisted tools</p>
                                        <p className="text-sm text-[color:var(--muted)]">
                                            Review outputs before relying on them.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Intro Callout */}
                <section className="mb-10 rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8">
                    <div className="flex items-start gap-3">
                        <TriangleAlert className="mt-1 h-6 w-6 text-amber-500" />
                        <div>
                            <h2 className="text-xl font-black tracking-tight">
                                Please read these terms carefully
                            </h2>
                            <p className="mt-3 max-w-4xl text-[color:var(--muted)] leading-8">
                                By using Platen PDF, you agree to these Terms, our Privacy Policy,
                                and any other policies referenced on the site. If you do not agree,
                                please do not use the Service.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Sections */}
                <div className="space-y-8">
                    <SectionCard icon={FileText} title="1. The Service" accent="slate">
                        <p>
                            Platen PDF provides online tools for working with documents and files.
                        </p>
                    </SectionCard>

                    <SectionCard icon={BadgeInfo} title="2. Accounts" accent="slate">
                        <p>
                            You are responsible for your account, credentials, and activity under your account.
                        </p>
                    </SectionCard>

                    <SectionCard icon={ShieldCheck} title="3. User Content" accent="emerald">
                        <p>
                            You retain ownership of your content. You grant us a limited license to process,
                            host, cache, transmit, and otherwise use your content only as necessary to provide
                            and improve the Service.
                        </p>
                    </SectionCard>

                    <SectionCard icon={Clock3} title="4. File Processing and Retention" accent="indigo">
                        <p>
                            Uploaded files and generated files are automatically and permanently deleted within
                            30 minutes of processing unless a shorter period applies.
                        </p>
                        <p>
                            This retention window exists only to complete the requested processing task and support
                            temporary delivery of results.
                        </p>
                    </SectionCard>

                    <SectionCard icon={CircleAlert} title="5. Acceptable Use" accent="amber">
                        <ul className="space-y-2">
                            <li>No illegal activity</li>
                            <li>No malware or harmful code</li>
                            <li>No unauthorized access</li>
                            <li>No abuse of the Service</li>
                            <li>No infringement of rights</li>
                        </ul>
                    </SectionCard>

                    <SectionCard icon={HandCoins} title="6. Subscriptions and Billing" accent="slate">
                        <p>
                            Some features may require a paid subscription. Our order process is conducted by our online reseller Paddle.com.
                            Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and returns.
                        </p>
                    </SectionCard>

                    <SectionCard icon={BadgeInfo} title="7. Cancellations and Refunds" accent="slate">
                        <p>
                            Refund terms are described in our Refund Policy.
                        </p>
                    </SectionCard>

                    <SectionCard icon={TriangleAlert} title="8. AI Features" accent="indigo">
                        <p>
                            AI-assisted results may be imperfect. You are responsible for reviewing output before
                            relying on it.
                        </p>
                    </SectionCard>

                    <SectionCard icon={Clock3} title="9. Service Availability" accent="slate">
                        <p>
                            We do not guarantee uninterrupted access to the Service.
                        </p>
                    </SectionCard>

                    <SectionCard icon={ShieldCheck} title="10. Intellectual Property" accent="slate">
                        <p>
                            All rights in the Service, including software, design, logos, and branding, belong to
                            Platen or its licensors.
                        </p>
                    </SectionCard>

                    <SectionCard icon={FileText} title="11. Third-Party Services" accent="slate">
                        <p>
                            The Service may depend on third-party providers such as Cloudflare, Google, GitHub,
                            Resend, Paddle, Vercel, and Railway.
                        </p>
                    </SectionCard>

                    <SectionCard icon={CircleAlert} title="12. Disclaimer" accent="rose">
                        <p>
                            The Service is provided “as is” and “as available”.
                        </p>
                    </SectionCard>

                    <SectionCard icon={TriangleAlert} title="13. Limitation of Liability" accent="rose">
                        <p>
                            To the fullest extent permitted by law, Platen will not be liable for indirect or
                            consequential damages.
                        </p>
                    </SectionCard>

                    <SectionCard icon={Scale} title="14. Indemnity" accent="amber">
                        <p>
                            You agree to indemnify and hold harmless Platen from claims arising from your use of
                            the Service or violation of these Terms.
                        </p>
                    </SectionCard>

                    <SectionCard icon={Clock3} title="15. Termination" accent="slate">
                        <p>
                            We may suspend or terminate access to the Service if we believe you violated these
                            Terms or used the Service abusively or unlawfully.
                        </p>
                    </SectionCard>

                    <SectionCard icon={Scale} title="16. Governing Law" accent="slate">
                        <p>
                            These Terms are governed by the laws of Sri Lanka.
                        </p>
                    </SectionCard>

                    <SectionCard icon={FileText} title="17. Changes to These Terms" accent="slate">
                        <p>
                            We may update these Terms from time to time.
                        </p>
                    </SectionCard>
                </div>

                {/* Contact */}
                <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Mail className="h-6 w-6 text-indigo-500" />
                        <h2 className="text-2xl font-black tracking-tight">18. Contact</h2>
                    </div>

                    <p className="max-w-3xl text-[color:var(--muted)] leading-8">
                        If you have questions about these Terms, contact the Platen team using any of the
                        addresses below.
                    </p>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                        <ContactChip
                            href="/contact"
                            label="Support"
                            email={EMAILS.support}
                        />
                        <ContactChip
                            href="/contact"
                            label="Contact"
                            email={EMAILS.contact}
                        />
                        <ContactChip
                            href="/contact"
                            label="Feedback"
                            email={EMAILS.feedback}
                        />
                    </div>
                </section>

                {/* Bottom bar */}
                <section className="mt-8 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-xl font-black tracking-tight">
                                Need a quick answer?
                            </h3>
                            <p className="mt-2 text-[color:var(--muted)] leading-7">
                                Visit the contact page or send a message to the support team directly.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/contact"
                                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                            >
                                <Mail className="h-4 w-4" />
                                Contact Page
                            </Link>
                            <Link
                                href="/refund"
                                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)]/40 px-5 py-3 text-sm font-semibold transition hover:border-indigo-500 hover:text-indigo-500"
                            >
                                Refund Policy
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}