"use client";

import React from "react";

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen px-6 py-12 max-w-4xl mx-auto text-[color:var(--foreground)]">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
                <p className="text-sm text-[color:var(--muted)]">
                    Last updated: June 17, 2026
                </p>
            </header>

            <section className="space-y-8 text-sm leading-relaxed text-[color:var(--muted)]">
                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        1. Overview
                    </h2>
                    <p>
                        This Privacy Policy explains how we collect, use, and protect your
                        information when you use our PDF processing service.
                    </p>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        2. Information We Collect
                    </h2>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Email address (account creation or login)</li>
                        <li>Name (optional)</li>
                        <li>Files you upload for processing</li>
                        <li>Usage data (features used, limits, errors)</li>
                        <li>Device and browser information</li>
                    </ul>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        3. How We Use Information
                    </h2>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Provide PDF processing features</li>
                        <li>Manage accounts and authentication</li>
                        <li>Enforce usage limits and subscriptions</li>
                        <li>Improve performance and security</li>
                        <li>Prevent abuse and system misuse</li>
                    </ul>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        4. File Handling
                    </h2>
                    <p>
                        Uploaded files are processed only to perform requested operations.
                        Files may be temporarily stored during processing and are deleted
                        after completion or within a short retention period.
                    </p>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        5. Payments
                    </h2>
                    <p>
                        Payments are handled by third-party payment providers. We do not
                        store full credit card details on our servers.
                    </p>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        6. Third-Party Services
                    </h2>
                    <p>
                        We may use services such as authentication providers, hosting
                        platforms, and payment processors. These services have their own
                        privacy policies.
                    </p>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        7. Data Retention
                    </h2>
                    <p>
                        We retain data only as long as necessary to provide the service,
                        comply with legal obligations, and resolve disputes.
                    </p>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        8. Security
                    </h2>
                    <p>
                        We implement reasonable technical and organizational measures to
                        protect your data. However, no system is completely secure.
                    </p>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        9. Your Rights
                    </h2>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Access your data</li>
                        <li>Request deletion of your account</li>
                        <li>Request correction of data</li>
                    </ul>
                </div>

                <div>
                    <h2 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                        10. Contact
                    </h2>
                    <p>
                        If you have questions about this Privacy Policy, contact us at:{" "}
                        <span className="font-medium">support@yourdomain.com</span>
                    </p>
                </div>
            </section>
        </div>
    );
}