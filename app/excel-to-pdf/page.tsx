"use client";

import OfficeToPdfConverter from "@/components/pdf/OfficeToPdfConverter";
import { FileSpreadsheet } from "lucide-react";

export default function ExcelToPdfPage() {
    return (
        <OfficeToPdfConverter
            sourceType="excel"
            allowedExtensions=".xls,.xlsx"
            title="Convert Excel to PDF"
            description="Flatten calculation sheets, structural tables, and grid values directly into printable documents."
            icon={<FileSpreadsheet size={32} className="text-emerald-500" />}
        />
    );
}