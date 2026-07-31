import Link from "next/link";
import {
    Cookie,
    ShieldCheck,
    Settings2,
    BarChart3,
    Calendar,
    ChevronRight,
} from "lucide-react";

export const metadata = {
    title: "Cookie Policy | Platen PDF",
    description: "Cookie Policy for Platen PDF.",
};

export default function CookiePolicyPage() {
    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            {/* Hero */}

            <div className="mb-14">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5 text-sm font-semibold text-indigo-500">
                    <Cookie className="h-4 w-4" />
                    Cookie Policy
                </div>

                <h1 className="mt-6 text-5xl font-black tracking-tight text-[color:var(--foreground)]">
                    How Platen PDF uses cookies.
                </h1>

                <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--muted-foreground)]">
                    This Cookie Policy explains what cookies are, why we use
                    them, and how they help provide a secure and reliable
                    experience while using Platen PDF.
                </p>

                <div className="mt-8">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-2 text-sm">
                        <Calendar className="h-4 w-4 text-indigo-500" />
                        Effective July 31, 2026
                    </div>
                </div>
            </div>

            {/* Intro */}

            <div className="mb-10 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-8">
                <p className="leading-8 text-[color:var(--muted-foreground)]">
                    We believe in transparency. Platen PDF currently uses only
                    cookies and similar technologies that are necessary for the
                    Service to operate securely and reliably. We do not use
                    advertising cookies, and we currently do not use analytics
                    cookies.
                </p>
            </div>

            <div className="space-y-8">

                {/* What are cookies */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Cookie className="h-6 w-6 text-amber-500" />
                        <h2 className="text-2xl font-black">
                            What Are Cookies?
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        Cookies are small text files stored on your device by
                        your web browser. They help websites remember
                        information between visits, maintain secure sessions,
                        and provide essential functionality.
                    </p>
                </section>

                {/* Types */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <ShieldCheck className="h-6 w-6 text-indigo-500" />
                        <h2 className="text-2xl font-black">
                            Cookies We Use
                        </h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        {[
                            {
                                title: "Authentication Cookies",
                                description:
                                    "Keep you signed in securely after logging in.",
                            },
                            {
                                title: "Session Cookies",
                                description:
                                    "Maintain your session while using Platen PDF.",
                            },
                            {
                                title: "Security Cookies",
                                description:
                                    "Help prevent fraud, abuse, and unauthorized access.",
                            },
                            {
                                title: "Preference Cookies",
                                description:
                                    "Remember basic settings such as preferences.",
                            },
                            {
                                title: "Infrastructure Cookies",
                                description:
                                    "Support load balancing and reliable service delivery.",
                            },
                        ].map((cookie) => (
                            <div
                                key={cookie.title}
                                className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-5"
                            >
                                <h3 className="font-bold">
                                    {cookie.title}
                                </h3>

                                <p className="mt-2 text-sm leading-7 text-[color:var(--muted-foreground)]">
                                    {cookie.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Why */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Settings2 className="h-6 w-6 text-emerald-500" />
                        <h2 className="text-2xl font-black">
                            Why We Use Cookies
                        </h2>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {[
                            "Keep you signed in",
                            "Protect user accounts",
                            "Secure active sessions",
                            "Prevent abuse and fraud",
                            "Remember basic preferences",
                            "Maintain core website functionality",
                        ].map((item) => (
                            <div
                                key={item}
                                className="flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4"
                            >
                                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />

                                <span className="text-sm leading-7 text-[color:var(--muted-foreground)]">
                                    {item}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Analytics */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <BarChart3 className="h-6 w-6 text-purple-500" />
                        <h2 className="text-2xl font-black">
                            Analytics & Marketing Cookies
                        </h2>
                    </div>

                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
                        <h3 className="font-bold text-emerald-600 dark:text-emerald-400">
                            Currently Not Used
                        </h3>

                        <p className="mt-3 leading-8 text-[color:var(--muted-foreground)]">
                            Platen PDF does not currently use analytics,
                            advertising, tracking, or marketing cookies. If
                            this changes in the future, this policy will be
                            updated before those technologies are introduced.
                        </p>
                    </div>
                </section>

                {/* Browser */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Settings2 className="h-6 w-6 text-orange-500" />
                        <h2 className="text-2xl font-black">
                            Managing Cookies
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        Most browsers allow you to control or delete cookies
                        through their settings. Please note that disabling
                        essential cookies may prevent login, reduce security,
                        or cause certain features of Platen PDF to stop
                        functioning correctly.
                    </p>
                </section>

                {/* Changes */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <h2 className="mb-5 text-2xl font-black">
                        Changes to this Cookie Policy
                    </h2>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        We may update this Cookie Policy from time to time as
                        our Service evolves or legal requirements change. The
                        latest version will always be available on this page.
                    </p>
                </section>

                {/* Contact */}

                <section className="rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-8">
                    <h2 className="text-2xl font-black">
                        Questions?
                    </h2>

                    <p className="mt-4 leading-8 text-[color:var(--muted-foreground)]">
                        If you have questions about how Platen PDF uses cookies,
                        feel free to contact us.
                    </p>

                    <Link
                        href="mailto:support@yourdomain.com"
                        className="mt-6 inline-flex rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white transition hover:bg-indigo-600"
                    >
                        support@yourdomain.com
                    </Link>
                </section>

            </div>
        </main>
    );
}