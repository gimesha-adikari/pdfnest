"use client";

import PdfSimpleAction from "@/components/pdf/PdfSimpleAction";
import { Droplet } from "lucide-react";

export default function GrayscalePdfPage() {
    return (
        <PdfSimpleAction
            title="Convert PDF to Grayscale"
            description="Remove all color from your document to save printer ink and reduce file size."
            icon={<Droplet size={32} className="text-gray-500" />}
            apiEndpoint="/api/optimize/grayscale"
            actionText="Convert to Black & White"
            loadingText="Flattening color profiles..."
            successMessage="All color channels have been successfully stripped from the document."
        />
    );
}