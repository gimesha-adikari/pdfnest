"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";

export default function Logo() {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    console.log("Logo rendered");

    if (!mounted) {
        return (
            <Image
                src="/platen-logo.svg"
                alt="Platen"
                fill
                className="object-contain p-1"
            />
        );
    }

    return (
        <Image
            src={
                resolvedTheme === "dark"
                    ? "/platen-logo-dark.svg"
                    : "/platen-logo.svg"
            }
            alt="Platen"
            fill
            className="object-contain p-1"
        />
    );
}