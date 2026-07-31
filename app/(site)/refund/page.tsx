import Link from "next/link";
import {
    Receipt,
    BadgeDollarSign,
    RotateCcw,
    CreditCard,
    Clock3,
    ShieldAlert,
    Calendar,
    CheckCircle2,
} from "lucide-react";

export const metadata = {
    title: "Refund Policy | Platen PDF",
    description: "Refund Policy for Platen PDF.",
};

export default function RefundPolicyPage() {
    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            {/* Hero */}

            <div className="mb-14">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-500">
                    <Receipt className="h-4 w-4" />
                    Refund Policy
                </div>

                <h1 className="mt-6 text-5xl font-black tracking-tight text-[color:var(--foreground)]">
                    Subscription refunds and billing.
                </h1>

                <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--muted-foreground)]">
                    This Refund Policy explains when refunds may be available,
                    how subscription cancellations work, and how to request
                    assistance with billing issues.
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
                    We aim to provide fair and transparent billing. If you
                    experience a payment issue, we'll work with you to resolve
                    it as quickly as possible.
                </p>
            </div>

            <div className="space-y-8">

                {/* General Rule */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <BadgeDollarSign className="h-6 w-6 text-emerald-500" />
                        <h2 className="text-2xl font-black">
                            General Refund Policy
                        </h2>
                    </div>

                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
                        <p className="leading-8 text-[color:var(--muted-foreground)]">
                            Unless required by applicable law, subscription
                            payments are generally non-refundable once a billing
                            period has started.
                        </p>
                    </div>
                </section>

                {/* Eligible */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <CheckCircle2 className="h-6 w-6 text-indigo-500" />
                        <h2 className="text-2xl font-black">
                            When Refunds May Be Approved
                        </h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        {[
                            "Duplicate charges",
                            "Accidental overbilling",
                            "Billing or payment processing errors",
                            "Verified technical issues that prevent service use",
                            "Refunds required by applicable law",
                        ].map((item) => (
                            <div
                                key={item}
                                className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-5"
                            >
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                                    <span className="text-sm leading-7 text-[color:var(--muted-foreground)]">
                                        {item}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Cancellation */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <RotateCcw className="h-6 w-6 text-orange-500" />
                        <h2 className="text-2xl font-black">
                            Subscription Cancellations
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        You may cancel your subscription at any time. Your
                        subscription will remain active until the end of the
                        current billing period, and future renewals will stop.
                        Cancelling a subscription does not automatically qualify
                        you for a refund.
                    </p>
                </section>

                {/* Request */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <CreditCard className="h-6 w-6 text-sky-500" />
                        <h2 className="text-2xl font-black">
                            Requesting a Refund
                        </h2>
                    </div>

                    <p className="mb-6 leading-8 text-[color:var(--muted-foreground)]">
                        To help us process your request quickly, please include:
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {[
                            "Account email address",
                            "Payment date",
                            "Payment reference or transaction ID",
                            "Brief explanation of the issue",
                        ].map((item) => (
                            <div
                                key={item}
                                className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-5 py-4 text-sm font-medium"
                            >
                                {item}
                            </div>
                        ))}
                    </div>

                    <Link
                        href="mailto:support@yourdomain.com"
                        className="mt-8 inline-flex rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white transition hover:bg-indigo-600"
                    >
                        Contact Support
                    </Link>
                </section>

                {/* Processing */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <Clock3 className="h-6 w-6 text-violet-500" />
                        <h2 className="text-2xl font-black">
                            Refund Processing
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        If a refund is approved, it will be processed using the
                        original payment method whenever possible. Processing
                        times may vary depending on your payment provider or
                        financial institution.
                    </p>
                </section>

                {/* Chargebacks */}

                <section className="rounded-3xl border border-red-500/20 bg-red-500/5 p-8">
                    <div className="mb-6 flex items-center gap-3">
                        <ShieldAlert className="h-6 w-6 text-red-500" />
                        <h2 className="text-2xl font-black">
                            Chargebacks
                        </h2>
                    </div>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        Before filing a chargeback with your payment provider,
                        please contact us. Most billing issues can be resolved
                        much faster through our support team.
                    </p>
                </section>

                {/* Changes */}

                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <h2 className="mb-5 text-2xl font-black">
                        Changes to This Policy
                    </h2>

                    <p className="leading-8 text-[color:var(--muted-foreground)]">
                        We may update this Refund Policy from time to time to
                        reflect changes in our services, billing practices, or
                        legal requirements. The latest version will always be
                        available on this page.
                    </p>
                </section>

            </div>
        </main>
    );
}