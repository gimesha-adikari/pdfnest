"use client";

import React, { useState } from "react";
import Link from "next/link";
import { submitContactTicket, ClientError } from "@/lib/api";
import {
    Mail,
    MessageSquare,
    Send,
    LifeBuoy,
    Bug,
    CreditCard,
    Shield,
    Scale,
    Clock3,
    ArrowRight,
    Paperclip,
    CircleHelp,
    CheckCircle2,
    Calendar,
    Loader2,
} from "lucide-react";

export default function ContactForm() {
    const categories = [
        { title: "General", value: "General Support", icon: LifeBuoy, color: "text-indigo-500" },
        { title: "Technical", value: "Technical Issue", icon: Bug, color: "text-orange-500" },
        { title: "Billing", value: "Billing & Refunds", icon: CreditCard, color: "text-emerald-500" },
        { title: "Security", value: "Security Report", icon: Shield, color: "text-red-500" },
        { title: "Legal", value: "Legal / DMCA", icon: Scale, color: "text-purple-500" },
    ];

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        category: "General Support",
        subject: "",
        message: "",
    });

    const [files, setFiles] = useState<File[]>([]);
    const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            // Match the backend attachment limit before constructing the request.
            const selectedFiles = Array.from(e.target.files).slice(0, 5);
            setFiles(selectedFiles);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("submitting");
        setErrorMessage("");

        const payload = new FormData();
        payload.append("name", formData.name);
        payload.append("email", formData.email);
        payload.append("category", formData.category);
        payload.append("subject", formData.subject);
        payload.append("message", formData.message);

        files.forEach((file) => {
            payload.append("attachments", file);
        });

        try {
            const res = await submitContactTicket(payload);
            setStatus("success");
            setSuccessMessage(`Ticket #${res.ticketNumber}: ${res.message}`);
            setFormData({ name: "", email: "", category: "General Support", subject: "", message: "" });
            setFiles([]);
        } catch (err) {
            setStatus("error");
            const error = err as ClientError;
            setErrorMessage(error.message || "An unexpected error occurred. Please try again.");
        }
    };

    return (
        <main className="mx-auto max-w-7xl px-6 py-16">
            {/* Hero */}
            <section className="mb-14">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5 text-sm font-semibold text-indigo-500">
                    <Mail className="h-4 w-4" />
                    Contact Us
                </div>
                <h1 className="mt-6 text-5xl font-black tracking-tight">We're here to help.</h1>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--muted-foreground)]">
                    Have a question, found a bug, need billing assistance, or want to report a security issue? Send us a message and we'll get back to you as quickly as possible.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-2 text-sm">
                        <Clock3 className="h-4 w-4 text-emerald-500" />
                        Average response: 1–2 business days
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-2 text-sm">
                        <Calendar className="h-4 w-4 text-indigo-500" />
                        Monday – Friday (Sri Lanka Time, UTC+5:30)
                    </div>
                </div>
            </section>

            {/* Categories */}
            <section className="mb-10">
                <h2 className="mb-5 text-xl font-bold">What can we help you with?</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {categories.map((category) => (
                        <button
                            key={category.title}
                            type="button"
                            onClick={() => setFormData({ ...formData, category: category.value })}
                            className={`group rounded-2xl border bg-[var(--card)] p-6 text-left transition-all hover:-translate-y-1 hover:shadow-lg ${
                                formData.category === category.value ? "border-indigo-500 ring-1 ring-indigo-500" : "border-[color:var(--border)] hover:border-indigo-500"
                            }`}
                        >
                            <category.icon className={`h-7 w-7 ${category.color}`} />
                            <h3 className="mt-4 font-bold">{category.title}</h3>
                            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                                Get help with {category.title.toLowerCase()} inquiries.
                            </p>
                        </button>
                    ))}
                </div>
            </section>

            <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
                {/* Form */}
                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8">
                    <div className="mb-8 flex items-center gap-3">
                        <MessageSquare className="h-6 w-6 text-indigo-500" />
                        <h2 className="text-2xl font-black">Send us a message</h2>
                    </div>

                    {status === "success" && (
                        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-600">
                            <h4 className="font-bold">Message Sent!</h4>
                            <p className="text-sm">{successMessage}</p>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-600">
                            <h4 className="font-bold">Failed to send message</h4>
                            <p className="text-sm">{errorMessage}</p>
                        </div>
                    )}

                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div className="grid gap-6 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-medium">Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Your name (optional)"
                                    disabled={status === "submitting"}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-indigo-500 disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium">Email *</label>
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="you@example.com"
                                    disabled={status === "submitting"}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-indigo-500 disabled:opacity-50"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Category *</label>
                            <select
                                name="category"
                                required
                                value={formData.category}
                                onChange={handleChange}
                                disabled={status === "submitting"}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-indigo-500 disabled:opacity-50"
                            >
                                <option value="General Support">General Support</option>
                                <option value="Technical Issue">Technical Issue</option>
                                <option value="Billing & Refunds">Billing & Refunds</option>
                                <option value="Security Report">Security Report</option>
                                <option value="Legal / DMCA">Legal / DMCA</option>
                                <option value="Feature Request">Feature Request</option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Subject *</label>
                            <input
                                type="text"
                                name="subject"
                                required
                                value={formData.subject}
                                onChange={handleChange}
                                placeholder="Brief summary"
                                disabled={status === "submitting"}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-indigo-500 disabled:opacity-50"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium">Message *</label>
                            <textarea
                                rows={8}
                                name="message"
                                required
                                value={formData.message}
                                onChange={handleChange}
                                placeholder="Describe your issue..."
                                disabled={status === "submitting"}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-indigo-500 disabled:opacity-50"
                            />
                        </div>

                        <div className="relative rounded-2xl border border-dashed border-[color:var(--border)] bg-[var(--background)] p-5 transition-colors hover:border-indigo-500">
                            <input
                                type="file"
                                multiple
                                onChange={handleFileChange}
                                disabled={status === "submitting"}
                                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf"
                            />
                            <div className="flex items-center gap-3">
                                <Paperclip className="h-5 w-5 text-indigo-500" />
                                <div>
                                    <p className="font-medium">
                                        {files.length > 0
                                            ? `${files.length} file(s) attached`
                                            : "Add Attachments (Max 10MB)"}
                                    </p>
                                    <p className="text-sm text-[color:var(--muted-foreground)]">
                                        {files.length > 0
                                            ? files.map(f => f.name).join(", ")
                                            : "Upload screenshots or PDFs to help us diagnose your issue faster."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={status === "submitting"}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-70"
                        >
                            {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {status === "submitting" ? "Sending..." : "Send Message"}
                        </button>
                    </form>
                </section>

                <aside className="space-y-6">
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-7">
                        <div className="flex items-center gap-3">
                            <Clock3 className="h-6 w-6 text-emerald-500" />
                            <h3 className="text-xl font-bold">Response Times</h3>
                        </div>
                        <div className="mt-6 space-y-4 text-sm">
                            <div className="flex justify-between">
                                <span>General</span>
                                <span className="font-medium">1–2 Days</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Billing</span>
                                <span className="font-medium">1 Business Day</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Security</span>
                                <span className="font-medium">Priority</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-7">
                        <h3 className="text-xl font-bold">Helpful Resources</h3>
                        <div className="mt-6 space-y-3">
                            {[
                                { href: "/security", label: "Security" },
                                { href: "/refund", label: "Refund Policy" },
                                { href: "/privacy", label: "Privacy Policy" },
                                { href: "/terms", label: "Terms of Service" },
                                { href: "/about", label: "About Platen PDF" },
                            ].map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-4 transition hover:border-indigo-500"
                                >
                                    <span>{item.label}</span>
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-7">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            <h3 className="text-xl font-bold">System Status</h3>
                        </div>
                        <div className="mt-5 flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full bg-emerald-500" />
                            <span className="font-medium">All systems operational</span>
                        </div>
                        <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                            API, authentication, and PDF processing services are operating normally.
                        </p>
                    </div>
                </aside>
            </div>
        </main>
    );
}
