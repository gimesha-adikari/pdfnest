"use client";

import OfficeConverter from "@/components/pdf/OfficeConverter";
import { FileText } from "lucide-react";

export default function PdfToWordPage() {
    return (
        <OfficeConverter
            targetFormat="docx"
            title="Convert PDF to Word"
            description="Transform flat uneditable PDF vectors back into completely fluid, selectable Microsoft Word documents."
            icon={<FileText size={32} className="text-blue-500" />}
        />
    );
}