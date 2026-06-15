"use client";

import OfficeToPdfConverter from "@/components/pdf/OfficeToPdfConverter";
import { FileText } from "lucide-react";

export default function WordToPdfPage() {
    return (
        <OfficeToPdfConverter
            sourceType="word"
            allowedExtensions=".doc,.docx"
            title="Convert Word to PDF"
            description="Transform Microsoft Word templates (.docx) into exact standardized document formats instantly."
            icon={<FileText size={32} className="text-blue-500" />}
        />
    );
}