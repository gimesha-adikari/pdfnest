"use client";

import OfficeToPdfConverter from "@/components/pdf/OfficeToPdfConverter";
import { Presentation } from "lucide-react";

export default function PowerPointToPdfWorkspace() {
    return (
        <OfficeToPdfConverter
            sourceType="powerpoint"
            allowedExtensions=".ppt,.pptx"
            title="Convert PowerPoint to PDF"
            description="Export individual pitch frames and vector slide sequences down into presentation PDF books."
            icon={<Presentation size={32} className="text-orange-500" />}
        />
    );
}