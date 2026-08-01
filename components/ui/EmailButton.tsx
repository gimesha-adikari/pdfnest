"use client";

import Link from "next/link";
import { toast } from "sonner";

interface EmailButtonProps {
    email: string;
    children?: React.ReactNode;
    className?: string;
    copyMessage?: string;
}

export function EmailButton({
                                email,
                                children = "Contact",
                                className,
                                copyMessage,
                            }: EmailButtonProps) {
    async function handleClick() {
        try {
            await navigator.clipboard.writeText(email);

            toast.success(copyMessage ?? "Email copied to clipboard", {
                description: email,
            });
        } catch {
            // Ignore clipboard failures.
        }
    }

    return (
        <Link
            href={`mailto:${email}`}
            onClick={handleClick}
            className={className}
        >
            {children}
        </Link>
    );
}