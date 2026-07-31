import ContactCard from "@/components/legal/ContactCard";

export const metadata = {
    title: "Privacy Policy | Platen PDF",
    description: "Privacy Policy for Platen PDF.",
};

const sections = [
    { id: "information", title: "1. Information We Collect" },
    { id: "use", title: "2. How We Use Your Information" },
    { id: "storage", title: "3. File Processing and Storage" },
    { id: "ai", title: "4. AI-Powered Features" },
    { id: "account", title: "5. Account Information" },
    { id: "payments", title: "6. Payments" },
    { id: "emails", title: "7. Email Communications" },
    { id: "third-party", title: "8. Third-Party Services" },
    { id: "security", title: "9. Data Storage and Security" },
    { id: "cookies", title: "10. Cookies" },
    { id: "children", title: "11. Children’s Privacy" },
    { id: "international", title: "12. International Users" },
    { id: "rights", title: "13. Your Rights" },
    { id: "changes", title: "14. Changes to This Privacy Policy" },
    { id: "contact", title: "15. Contact Us" },
];

const EMAILS = {
    support: "support@platenpdf.com",
    contact: "contact@platenpdf.com",
    feedback: "feedback@platenpdf.com",
};

export default function PrivacyPolicyPage() {
    return (
        <main className="min-h-screen bg-gradient-to-b from-background via-background to-background/80">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
                <div className="mb-8 rounded-3xl border border-border/60 bg-card/70 p-6 sm:p-8 shadow-sm backdrop-blur">
                    <div className="flex flex-col gap-4">
                        <div className="inline-flex w-fit items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-500">
                            Legal Document
                        </div>

                        <div className="space-y-3">
                            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                                Privacy Policy
                            </h1>
                            <p className="max-w-3xl text-sm sm:text-base leading-7 text-muted-foreground">
                                This Privacy Policy explains how Platen PDF collects, uses, stores, and protects your information when you use our services.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3 pt-2">
                            <div className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                                Effective Date: July 31, 2026
                            </div>
                            <div className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                                Operated by Platen
                            </div>
                            <div className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                                Sri Lanka
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                    <aside className="lg:sticky lg:top-6 h-fit rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
                        <h2 className="text-sm font-bold tracking-tight text-foreground">
                            On this page
                        </h2>
                        <nav className="mt-4 space-y-2">
                            {sections.map((section) => (
                                <a
                                    key={section.id}
                                    href={`#${section.id}`}
                                    className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                    {section.title}
                                </a>
                            ))}
                        </nav>
                    </aside>

                    <article className="space-y-6">
                        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <p className="text-sm leading-7 text-foreground/90">
                                Platen PDF is operated by Platen (&#34;we&#34;, &#34;us&#34;, or &#34;our&#34;), an individual based in Sri Lanka.
                                We respect your privacy and are committed to protecting your personal information. This Privacy
                                Policy explains what information we collect, how we use it, how we store it, and the choices you
                                have regarding your data.
                            </p>
                            <p className="mt-4 text-sm leading-7 text-foreground/90">
                                By using Platen PDF, you agree to the collection and use of information in accordance with this
                                Privacy Policy.
                            </p>
                        </section>

                        <section id="information" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                1. Information We Collect
                            </h2>

                            <div className="mt-5 space-y-6 text-sm leading-7 text-foreground/90">
                                <div>
                                    <h3 className="text-base font-semibold text-foreground">
                                        Information You Provide
                                    </h3>
                                    <p className="mt-2 text-muted-foreground">
                                        When you create an account or contact us, we may collect:
                                    </p>
                                    <ul className="mt-3 space-y-2 pl-5 list-disc marker:text-indigo-500">
                                        <li>Email address</li>
                                        <li>Account credentials</li>
                                        <li>Information submitted through support, contact, or feedback forms</li>
                                        <li>Any other information you choose to provide</li>
                                    </ul>
                                    <p className="mt-3 text-muted-foreground">
                                        If you sign in using Google, we may receive basic profile information that you authorize
                                        Google to share, such as email address, display name, and profile picture, if available. We
                                        do not receive or store your Google password.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-base font-semibold text-foreground">
                                        Uploaded Files
                                    </h3>
                                    <p className="mt-2 text-muted-foreground">
                                        When you use Platen PDF tools, you may upload documents, images, or other supported file
                                        types for processing. These files are processed only to provide the requested service. We do
                                        not claim ownership of your files.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-base font-semibold text-foreground">
                                        Automatically Collected Information
                                    </h3>
                                    <p className="mt-2 text-muted-foreground">
                                        We may automatically collect technical and usage information such as:
                                    </p>
                                    <ul className="mt-3 grid gap-2 pl-5 list-disc marker:text-indigo-500 sm:grid-cols-2">
                                        <li>IP address</li>
                                        <li>Browser type</li>
                                        <li>Device information</li>
                                        <li>Operating system</li>
                                        <li>Pages visited</li>
                                        <li>Date and time of access</li>
                                        <li>Error logs</li>
                                        <li>Security logs</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section id="use" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                2. How We Use Your Information
                            </h2>
                            <ul className="mt-5 space-y-2 pl-5 list-disc marker:text-indigo-500 text-sm leading-7 text-foreground/90">
                                <li>Provide PDF and document processing services</li>
                                <li>Create and manage your account</li>
                                <li>Verify your email address</li>
                                <li>Process subscriptions and billing</li>
                                <li>Send password reset emails</li>
                                <li>Respond to support requests</li>
                                <li>Improve our services and performance</li>
                                <li>Detect abuse, fraud, and unauthorized use</li>
                                <li>Protect the security and integrity of our systems</li>
                                <li>Comply with legal obligations</li>
                            </ul>
                        </section>

                        <section id="storage" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                3. File Processing and Storage
                            </h2>
                            <div className="mt-4 space-y-4 text-sm leading-7 text-foreground/90">
                                <p className="text-muted-foreground">
                                    Your uploaded files are processed automatically by our systems.
                                </p>
                                <p className="text-muted-foreground">
                                    We do not intentionally review the contents of your files. Human access to uploaded files
                                    will only occur when reasonably necessary to investigate technical issues, diagnose system
                                    failures, respond to security incidents, comply with applicable law, or protect rights,
                                    safety, or security.
                                </p>
                                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/8 p-4">
                                    <p className="font-medium text-foreground">
                                        Uploaded files and generated files are automatically and permanently deleted within{" "}
                                        <span className="font-bold text-indigo-500">30 minutes</span> of processing unless a shorter
                                        period applies.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section id="ai" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                4. AI-Powered Features
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                Some Platen PDF tools may use artificial intelligence or machine learning technologies to
                                provide features such as document recognition, extraction, analysis, or enhancement.
                            </p>
                        </section>

                        <section id="account" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                5. Account Information
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                You may delete your account at any time using the available account settings or by contacting
                                us. When an account is deleted, we will remove or anonymize personal information associated
                                with the account, except where retention is required for legal, security, fraud prevention,
                                accounting, or contractual obligations.
                            </p>
                        </section>

                        <section id="payments" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                6. Payments
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                Subscriptions and payments are processed securely through Paddle. We do not store your full
                                payment card information.
                            </p>
                        </section>

                        <section id="emails" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                7. Email Communications
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                We may send service-related emails, including email verification, password reset, billing
                                notifications, subscription information, and important service announcements.
                            </p>
                        </section>

                        <section id="third-party" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                8. Third-Party Services
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                We may use third-party providers such as Cloudflare, Google, GitHub, Resend, Paddle, Vercel,
                                and Railway.
                            </p>
                        </section>

                        <section id="security" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                9. Data Storage and Security
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                Files and application data may be stored using cloud infrastructure, including Cloudflare R2
                                and other infrastructure providers as needed.
                            </p>
                        </section>

                        <section id="cookies" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                10. Cookies
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                Platen PDF uses cookies and similar technologies necessary for authentication, security, and
                                essential functionality.
                            </p>
                        </section>

                        <section id="children" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                11. Children’s Privacy
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                Platen PDF is not intended for children under the age of 13.
                            </p>
                        </section>

                        <section id="international" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                12. International Users
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                Your information may be processed or stored in countries where our service providers operate.
                            </p>
                        </section>

                        <section id="rights" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                13. Your Rights
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                Depending on applicable law, you may have rights to access, correct, or delete your personal
                                information and to contact us regarding privacy concerns.
                            </p>
                        </section>

                        <section id="changes" className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                14. Changes to This Privacy Policy
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-muted-foreground">
                                We may update this Privacy Policy from time to time.
                            </p>
                        </section>

                        <section
                            id="contact"
                            className="rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-7 shadow-sm"
                        >
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                                15. Contact Us
                            </h2>

                            <p className="mt-3 text-sm leading-7 text-muted-foreground">
                                If you have questions about this Privacy Policy or our privacy practices,
                                we&#39;re happy to help.
                            </p>

                            <div className="mt-6 grid gap-4 sm:grid-cols-3">
                                <ContactCard
                                    title="Support"
                                    email={EMAILS.support}
                                />

                                <ContactCard
                                    title="Contact"
                                    email={EMAILS.contact}
                                />

                                <ContactCard
                                    title="Feedback"
                                    email={EMAILS.feedback}
                                />
                            </div>
                        </section>
                    </article>
                </div>
            </div>
        </main>
    );
}