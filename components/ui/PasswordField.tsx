"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function getPasswordFieldPresentation(isVisible: boolean) {
    return {
        inputType: isVisible ? "text" : "password",
        label: isVisible ? "Hide password" : "Show password",
    } as const;
}

export default function PasswordField({ className = "", disabled = false, ...props }: PasswordFieldProps) {
    const [isVisible, setIsVisible] = useState(false);
    const { inputType, label } = getPasswordFieldPresentation(isVisible);

    return (
        <div className="relative w-full">
            <input
                {...props}
                type={inputType}
                disabled={disabled}
                className={`${className} pr-12`}
            />
            <button
                type="button"
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setIsVisible((visible) => !visible)}
                aria-label={label}
                aria-pressed={isVisible}
                title={label}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[color:var(--muted-foreground)] transition-colors hover:text-[color:var(--foreground)] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            </button>
        </div>
    );
}
