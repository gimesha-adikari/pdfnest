"use client";

import PdfSimpleAction from "@/components/pdf/PdfSimpleAction";
import { Wrench } from "lucide-react";

export default function RepairPdfWorkspace() {
    return (
        <PdfSimpleAction
            title="Repair Corrupt PDF"
            description="Rebuild broken dictionary trees and fix damaged PDF files so they can be opened again."
            icon={<Wrench size={32} className="text-blue-500" />}
            apiEndpoint="/api/structure/repair"
            actionText="Repair PDF Document"
            loadingText="Rebuilding xref tables..."
            successMessage="Document structure has been successfully repaired and rewritten."
        />
    );
}