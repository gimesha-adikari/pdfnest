export interface ToolItem {
    title: string;
    description: string;
    href: string;
    category: "editing" | "convert" | "security";
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
        isNew: false,
    },
    {
        title: "Edit PDF Metadata",
        description: "Modify document property values like Title, Author, Subject description and system Keywords tags.",
        href: "/edit-metadata",
        category: "editing",
    },
    {
        title: "Protect PDF",
        description: "Secure your documents by applying robust, high-grade permissions encryption configurations.",
        href: "/lock-pdf",
        category: "security",
    },
    {
        title: "Unlock PDF",
        description: "Strip protection limits, passwords, and security encryption blocks instantly from your documents.",
        href: "/unlock-pdf",
        category: "security",
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
    },{
        title: "PDF Studio",
        description: "Edit and process your PDF in one tool",
        href: "/studio",
        category: "editing"
    },{
        title: "Office to PDF",
        description: "Convert Word (.docx), Excel (.xlsx), and PowerPoint (.pptx) documents into standard vector PDFs instantly.",
        href: "/office-to-pdf",
        category: "convert",
        isNew: true,
    }, {
        title: "URL to PDF Website Capture",
        description: "Input a live webpage link to render, scrape, and capture the DOM viewport directly into a printable vector PDF template document.",
        href: "/url-to-pdf",
        category: "convert",
        isNew: true,
    },{
        title: "Markdown to PDF",
        description: "Convert documentation files (.md) into clean, typography-focused vector PDFs instantly.",
        href: "/markdown-to-pdf",
        category: "convert",
        isNew: true,
    },{
        title: "Source Code to PDF",
        description: "Convert development script documents into clean syntax-highlighted printable vector sheets instantly.",
        href: "/code-to-pdf",
        category: "convert",
        isNew: true,
    },{
        title: "Secure Redaction",
        description: "Permanently scrub and strip explicit textual references entirely out of the underlying source objects.",
        href: "/redact-pdf",
        category: "security"
    },{
        title: "PDF Editor",
        description: "edit PDF as you wish",
        href: "/edit-pdf",
        category: "editing"
    }
];