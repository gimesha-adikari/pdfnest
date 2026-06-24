"use client";

import OfficeConverter from "@/components/pdf/OfficeConverter";
import { Presentation } from "lucide-react";

export default function PdfToPowerPointWorkspace() {
    return (
        <OfficeConverter
            targetFormat="pptx"
            title="Convert PDF to PowerPoint"
            description="Transform flat uneditable PDF vectors back into completely fluid, selectable Microsoft PowerPoint documents."
            icon={<Presentation size={32} className="text-orange-500" />}
        />
    );
}