"use client";

import { useRef, useState } from "react";

export function useStudioSidebar() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const uploadInputRef =
        useRef<HTMLInputElement>(null);

    const toggleSidebar = () =>
        setIsSidebarOpen((v) => !v);

    const openUpload = () =>
        uploadInputRef.current?.click();

    return {
        isSidebarOpen,
        toggleSidebar,
        uploadInputRef,
        openUpload,
    };
}