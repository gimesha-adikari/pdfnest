"use client";

import OfficeConverter from "@/components/pdf/OfficeConverter";
import { Presentation } from "lucide-react";

export default function PdfToPowerPointWorkspace() {
    return (
        <OfficeConverter
            targetFormat="pptx"
            title="Convert PDF to PowerPoint"
            description="Create a PPTX with one slide-sized image per PDF page. Text and graphics in each image are not individually editable; you can rearrange slides and add new content in PowerPoint."
            icon={<Presentation size={32} className="text-orange-500" />}
        />
    );
}