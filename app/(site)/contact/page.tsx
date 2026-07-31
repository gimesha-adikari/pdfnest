import { Metadata } from "next";
import ContactForm from "@/components/contact/ContactForm";

export const metadata: Metadata = {
    title: "Contact Us | Platen PDF",
    description:
        "Contact the Platen PDF team for support, billing, security, legal inquiries, and technical assistance.",
};

export default function ContactPage() {
    return <ContactForm />;
}