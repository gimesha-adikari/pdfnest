"use client";

import OfficeConverter from "@/components/pdf/OfficeConverter";
import { FileSpreadsheet } from "lucide-react";

export default function PdfToExcelPage() {
    return (
        <OfficeConverter
            targetFormat="xlsx"
            title="Convert PDF to Excel"
            description="Extract embedded data columns and calculation tabular maps out of document pages into structured sheets."
            icon={<FileSpreadsheet size={32} className="text-emerald-500" />}
        />
    );
}