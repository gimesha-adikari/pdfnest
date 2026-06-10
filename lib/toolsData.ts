export interface ToolItem {
    title: string;
    description: string;
    href: string;
    category: "editing" | "convert";
    isNew?: boolean;
}

export const NAV_TOOLS: ToolItem[] = [
    {
        title: "Merge PDF",
        description: "Combine multiple PDF files into one.",
        href: "/merge-pdf",
        category: "editing",
    },
    {
        title: "Split PDF",
        description: "Extract pages from a PDF.",
        href: "/split-pdf",
        category: "editing",
    },
    {
        title: "Rotate PDF",
        description: "Rotate PDF pages easily.",
        href: "/rotate-pdf",
        category: "editing",
    },
    {
        title: "Delete Pages",
        description: "Remove specific pages from a PDF.",
        href: "/delete-pages",
        category: "editing",
    },
    {
        title: "Reorder Pages",
        description: "Change the order of PDF pages.",
        href: "/reorder-pages",
        category: "editing",
    },
    {
        title: "Watermark PDF",
        description: "Add text watermarks to PDF pages.",
        href: "/watermark-pdf",
        category: "editing",
    },
    {
        title: "Compress PDF",
        description: "Reduce PDF file size.",
        href: "/compress-pdf",
        category: "editing",
    },
    {
        title: "Add Page Numbers",
        description: "Easily add page numbers to your PDF document. Choose position, dimensions, and numerical formatting styles.",
        href: "/add-page-numbers",
        category: "editing",
        isNew: true,
    },
    {
        title: "Edit PDF Metadata",
        description: "Modify document property values like Title, Author, Subject description and system Keywords tags.",
        href: "/edit-metadata",
        category: "editing",
        isNew: true,
    },
    {
        title: "Protect PDF",
        description: "Secure your documents by applying robust, high-grade permissions encryption configurations.",
        href: "/lock-pdf",
        category: "convert",
        isNew: true,
    },
    {
        title: "Unlock PDF",
        description: "Strip protection limits, passwords, and security encryption blocks instantly from your documents.",
        href: "/unlock-pdf",
        category: "convert",
        isNew: true,
    },
    {
        title: "Images to PDF",
        description: "Convert images into PDF files.",
        href: "/images-to-pdf",
        category: "convert",
    },
    {
        title: "PDF to Images",
        description: "Convert PDF pages into JPG or PNG images.",
        href: "/pdf-to-images",
        category: "convert",
    }, {
        title: "PDF to text",
        description: "Extract Text from PDF",
        href: "/pdf-to-text",
        category: "convert"
    },{
        title: "Text Images to Text PDF",
        description: "Extract Text from Images and convert to PDF",
        href: "/image-to-text-pdf",
        category: "convert"
    },
];