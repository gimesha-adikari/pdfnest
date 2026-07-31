"use client";

import * as React from "react";
import { Check } from "lucide-react";
import clsx from "clsx";

export interface CheckboxProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    (
        {
            checked = false,
            onCheckedChange,
            className,
            disabled,
            id,
            ...props
        },
        ref
    ) => {
        return (
            <label
                htmlFor={id}
                className={clsx(
                    "relative inline-flex h-5 w-5 shrink-0 cursor-pointer select-none items-center justify-center rounded-md border transition-all",
                    checked
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-[color:var(--border)] bg-[color:var(--background)] hover:border-indigo-400",
                    disabled &&
                    "cursor-not-allowed opacity-50 hover:border-[color:var(--border)]",
                    className
                )}
            >
                <input
                    ref={ref}
                    id={id}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onCheckedChange?.(e.target.checked)}
                    className="sr-only"
                    {...props}
                />

                <Check
                    size={14}
                    className={clsx(
                        "transition-all",
                        checked ? "scale-100 opacity-100" : "scale-75 opacity-0"
                    )}
                />
            </label>
        );
    }
);

Checkbox.displayName = "Checkbox";