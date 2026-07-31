import Link from "next/link";

type ContactCardProps = {
    title: string;
    email: string;
};

export default function ContactCard({ title, email }: ContactCardProps) {
    return (
        <div className="rounded-2xl border border-border bg-background/70 p-4 transition-all hover:border-indigo-500/40 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
            </p>

            <Link
                href={`mailto:${email}`}
                className="mt-2 block break-all text-sm font-medium text-indigo-500 transition-colors hover:text-indigo-400 hover:underline"
            >
                {email}
            </Link>
        </div>
    );
}