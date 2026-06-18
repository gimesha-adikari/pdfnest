export interface ToolFAQ {
    question: string;
    answer: string;
}

export interface ToolItem {
    title: string;
    description: string;
    href: string;
    category:
        | "editing"
        | "convert"
        | "security";
    keywords?: string[];
    seoTitle?: string;
    seoDescription?: string;
    intent?: string;
    related?: string[];
    faq?: ToolFAQ[];
    features?: string[];
    isNew?: boolean;
}

export const NAV_TOOLS: ToolItem[] = [
    {
        title: "Merge PDF",
        description: "Combine multiple PDF files into one document quickly and easily.",
        href: "/merge-pdf",
        category: "editing",
        seoTitle: "Merge PDF Online Free - Combine PDF Files",
        seoDescription: "Merge multiple PDF files into one document online. Arrange pages and create a single PDF quickly with PDFNest.",
        intent: "Users want to combine multiple PDF documents into one file.",
        keywords: [
            "merge pdf online",
            "combine pdf files",
            "join pdf documents",
            "pdf merger"
        ],
        related: [
            "/split-pdf",
            "/compress-pdf",
            "/pdf-to-word"
        ],
        faq: [
            {
                question: "Can I merge multiple PDF files?",
                answer: "Yes. PDFNest allows you to combine multiple PDF documents into one file."
            },
            {
                question: "Is it free to merge PDFs?",
                answer: "Yes, our PDF merging tool is completely free to use online."
            }
        ]
    },
    {
        title: "Split PDF",
        description: "Extract specific pages from a PDF or separate files into individual sheets.",
        href: "/split-pdf",
        category: "editing",
        seoTitle: "Split PDF Online Free - Extract Pages",
        seoDescription: "Extract specific pages or separate a large PDF into multiple smaller files instantly online.",
        intent: "Users want to separate a PDF into multiple files or extract specific pages.",
        keywords: [
            "extract pdf pages",
            "cut pdf pages",
            "separate pdf"
        ],
        related: [
            "/merge-pdf",
            "/delete-pages"
        ],
        faq: [
            {
                question: "Can I extract specific pages from a PDF?",
                answer: "Yes, you can choose exact page numbers or specific ranges to extract into a new PDF document."
            },
            {
                question: "Will splitting a PDF affect its original quality?",
                answer: "No, our tool extracts the pages without altering the original visual quality or formatting."
            }
        ]
    },
    {
        title: "Rotate PDF",
        description: "Rotate PDF pages easily and permanently change document orientations layout grids.",
        href: "/rotate-pdf",
        category: "editing",
        seoTitle: "Rotate PDF Pages Online Free",
        seoDescription: "Permanently rotate individual PDF pages or entire documents online quickly and easily.",
        intent: "Users want to fix the orientation of PDF pages.",
        keywords: [
            "turn pdf pages",
            "flip pdf document",
            "change pdf orientation"
        ],
        related: [
            "/edit-pdf",
            "/delete-pages"
        ],
        faq: [
            {
                question: "Can I rotate individual pages or the whole document?",
                answer: "You can choose to rotate specific individual pages or apply the rotation to the entire PDF document simultaneously."
            },
            {
                question: "Is the rotation permanent?",
                answer: "Yes, once you apply the changes and save the rotated PDF, the new orientation is permanently saved to the file."
            }
        ]
    },
    {
        title: "Delete Pages",
        description: "Remove specific unneeded pages from a PDF document stream instantly.",
        href: "/delete-pages",
        category: "editing",
        seoTitle: "Delete Pages from PDF Online Free",
        seoDescription: "Remove unwanted pages from your PDF documents instantly. Fast, secure, and free online tool.",
        intent: "Users want to remove unwanted pages from a PDF document.",
        keywords: [
            "remove pdf pages",
            "prune pdf",
            "discard document frames"
        ],
        related: [
            "/split-pdf",
            "/reorder-pages"
        ],
        faq: [
            {
                question: "How do I remove a page from my PDF?",
                answer: "Simply upload your PDF, visually select the specific pages you want to discard, and click delete to generate your new document."
            },
            {
                question: "Can I delete multiple pages at once?",
                answer: "Yes, you can select multiple individual pages or specify a continuous range of pages to delete simultaneously."
            }
        ]
    },
    {
        title: "Reorder Pages",
        description: "Change the order of PDF pages visually using an interactive sorting grid sequence layout.",
        href: "/reorder-pages",
        category: "editing",
        seoTitle: "Reorder PDF Pages Online Free",
        seoDescription: "Drag and drop to rearrange PDF pages easily. Organize your document exactly how you need it.",
        intent: "Users want to change the sequence of pages within a PDF.",
        keywords: [
            "rearrange pdf pages",
            "organize pdf sheets",
            "sort pdf frames"
        ],
        related: [
            "/merge-pdf",
            "/delete-pages"
        ],
        faq: [
            {
                question: "How do I rearrange the pages in my PDF?",
                answer: "Upload your file and use our interactive visual grid to simply drag and drop pages into your desired sequence."
            },
            {
                question: "Does reordering pages change the file size?",
                answer: "No, reordering simply changes the sequence of the existing pages without affecting the content or significantly altering the file size."
            }
        ]
    },
    {
        title: "Watermark PDF",
        description: "Add custom text watermarks or image stamps securely to PDF layout backgrounds.",
        href: "/watermark-pdf",
        category: "editing",
        seoTitle: "Add Watermark to PDF Online Free",
        seoDescription: "Stamp your documents by adding customizable text or image watermarks to your PDF files securely.",
        intent: "Users want to brand or protect their PDFs with a visual watermark.",
        keywords: [
            "stamp pdf",
            "add logo to pdf",
            "text overlay pdf"
        ],
        related: [
            "/edit-pdf",
            "/lock-pdf"
        ],
        faq: [
            {
                question: "Can I use an image as a watermark?",
                answer: "Yes, our tool allows you to upload an image logo or type custom text to use as your document watermark."
            },
            {
                question: "Can I adjust the transparency of the watermark?",
                answer: "Yes, you have full control to customize the opacity, scale, position, and rotation of your applied watermark."
            }
        ]
    },
    {
        title: "Compress PDF",
        description: "Reduce PDF file sizes instantly by stripping object redundancy and unneeded systems metadata.",
        href: "/compress-pdf",
        category: "editing",
        seoTitle: "Compress PDF Files Online Free",
        seoDescription: "Reduce the size of your PDF files without losing quality. Fast and secure online PDF optimizer.",
        intent: "Users want to make a PDF file smaller for emailing or uploading.",
        keywords: [
            "shrink pdf file",
            "optimize pdf footprint",
            "make pdf size smaller"
        ],
        related: [
            "/merge-pdf",
            "/grayscale-pdf"
        ],
        faq: [
            {
                question: "Will compressing my PDF ruin the images?",
                answer: "Our compression tool intelligently optimizes the file size while maintaining the best possible visual quality for all embedded images."
            },
            {
                question: "Can I compress very large PDF files?",
                answer: "Yes, you can upload and significantly reduce the size of large PDF documents securely right in your browser."
            }
        ]
    },
    {
        title: "Add Page Numbers",
        description: "Easily add sequential page numbers to your PDF document. Choose positions, dimensions, and styling elements.",
        href: "/add-page-numbers",
        category: "editing",
        seoTitle: "Add Page Numbers to PDF Online Free",
        seoDescription: "Insert page numbers into your PDF documents. Customize position, font, and starting number easily.",
        intent: "Users want to number the pages of a PDF document.",
        keywords: [
            "pdf pagination",
            "insert page indices",
            "number pdf sheets"
        ],
        related: [
            "/edit-pdf",
            "/watermark-pdf"
        ],
        isNew: false,
        faq: [
            {
                question: "Can I choose where the page numbers appear?",
                answer: "Yes, you can select exact positioning, such as bottom center, top right, or custom margins for your page numbers."
            },
            {
                question: "Can I start numbering from a specific page?",
                answer: "Yes, you can configure the starting page number and choose from different numerical sequence styles."
            }
        ]
    },
    {
        title: "Edit PDF Metadata",
        description: "Modify document property values like Title, Author, Subject description and system Keywords tags.",
        href: "/edit-metadata",
        category: "editing",
        seoTitle: "Edit PDF Metadata Online Free",
        seoDescription: "View and change hidden PDF properties, including author, title, keywords, and subject data.",
        intent: "Users want to change the hidden property fields of a PDF.",
        keywords: [
            "change pdf properties",
            "update document author",
            "hidden file info tag"
        ],
        related: [
            "/edit-pdf",
            "/repair-pdf"
        ],
        faq: [
            {
                question: "What metadata fields can I edit?",
                answer: "You can modify all standard document properties including Title, Author, Subject, and Keywords."
            },
            {
                question: "Why should I edit PDF metadata?",
                answer: "Updating metadata improves document organization, helps with SEO and searchability, and ensures accurate file attribution."
            }
        ]
    },
    {
        title: "Protect PDF",
        description: "Secure your documents by applying robust, high-grade permissions access encryption configurations.",
        href: "/lock-pdf",
        category: "security",
        seoTitle: "Password Protect PDF Online Free",
        seoDescription: "Encrypt and lock your PDF files with a secure password to prevent unauthorized access or printing.",
        intent: "Users want to add a password to restrict access to their PDF.",
        keywords: [
            "password protect pdf",
            "encrypt pdf online",
            "secure file restriction"
        ],
        related: [
            "/unlock-pdf",
            "/watermark-pdf"
        ],
        faq: [
            {
                question: "What type of encryption is used to protect my PDF?",
                answer: "We utilize robust, industry-standard AES encryption to ensure your document remains completely secure."
            },
            {
                question: "Can I prevent printing or copying of my PDF?",
                answer: "Yes, our tool allows you to set specific owner permissions to restrict printing, copying text, and editing."
            }
        ]
    },
    {
        title: "Unlock PDF",
        description: "Strip protection limits, passwords, and security encryption blocks instantly from your documents.",
        href: "/unlock-pdf",
        category: "security",
        seoTitle: "Unlock PDF Online Free - Remove Password",
        seoDescription: "Remove passwords and security restrictions from PDF files quickly. Decrypt PDFs instantly.",
        intent: "Users want to remove password protection or restrictions from a PDF.",
        keywords: [
            "remove password from pdf",
            "decrypt restricted pdf",
            "bypass pdf permissions"
        ],
        related: [
            "/lock-pdf",
            "/edit-pdf"
        ],
        faq: [
            {
                question: "Can I remove a password if I forgot it?",
                answer: "Our tool can instantly remove owner passwords and restrictions. However, if the file has a strict user/open password, you must provide the password to decrypt it."
            },
            {
                question: "Will unlocking the PDF change its contents?",
                answer: "No, unlocking only strips the security restrictions, leaving your document's text, images, and formatting completely intact."
            }
        ]
    },
    {
        title: "Images to PDF",
        description: "Convert graphic image files (PNG, JPG, WebP) into organized, optimized PDF files easily.",
        href: "/images-to-pdf",
        category: "convert",
        seoTitle: "Convert Images to PDF Online Free",
        seoDescription: "Combine JPG, PNG, and WebP images into a single PDF document easily. High-quality image conversion.",
        intent: "Users want to turn picture files into a single PDF document.",
        keywords: [
            "convert jpg to pdf",
            "png to pdf converter",
            "compile picture package"
        ],
        related: [
            "/pdf-to-images",
            "/merge-pdf"
        ],
        faq: [
            {
                question: "What image formats are supported?",
                answer: "You can convert all popular web image formats including JPG, PNG, WebP, and GIF directly into a PDF."
            },
            {
                question: "Can I combine multiple images into a single PDF?",
                answer: "Yes, you can upload multiple images at once, rearrange their order, and merge them all into one organized PDF document."
            }
        ]
    },
    {
        title: "PDF to Images",
        description: "Convert PDF pages into high-resolution JPG or PNG graphic image files instantly.",
        href: "/pdf-to-images",
        category: "convert",
        seoTitle: "Convert PDF to JPG/PNG Images Free",
        seoDescription: "Extract pages from your PDF and save them as high-quality JPG or PNG images instantly.",
        intent: "Users want to turn PDF pages into standalone image files.",
        keywords: [
            "rasterize pdf to image",
            "pdf to png download",
            "extract pages as photos"
        ],
        related: [
            "/images-to-pdf",
            "/pdf-to-text"
        ],
        faq: [
            {
                question: "Will each page become a separate image?",
                answer: "Yes, the conversion tool extracts every single page of your PDF and converts it into its own high-resolution JPG or PNG file."
            },
            {
                question: "Does it preserve the original image quality?",
                answer: "Yes, the conversion process uses high-DPI rendering to maintain the crisp visual fidelity of your original document."
            }
        ]
    },
    {
        title: "PDF to text",
        description: "Extract hidden raw text layer data strings directly out of text-based PDF pages.",
        href: "/pdf-to-text",
        category: "convert",
        seoTitle: "Convert PDF to Text Online Free",
        seoDescription: "Extract text from PDF documents quickly. Convert PDF to raw TXT files instantly online.",
        intent: "Users want to extract readable text from a PDF file.",
        keywords: [
            "convert pdf to txt",
            "scrape text from pdf",
            "copy unselectable pdf text"
        ],
        related: [
            "/pdf-to-word",
            "/image-to-text-pdf"
        ],
        faq: [
            {
                question: "Can this tool extract text from scanned documents?",
                answer: "If the PDF contains a selectable text layer, it will be extracted perfectly. For completely flattened image scans, our OCR tool is recommended."
            },
            {
                question: "What format will the extracted text be in?",
                answer: "The tool outputs clean, raw text data into a standard TXT format file that you can easily copy, edit, and paste anywhere."
            }
        ]
    },
    {
        title: "Text Images to Text PDF",
        description: "Extract text elements from scanned images or documents using smart OCR processing structures.",
        href: "/image-to-text-pdf",
        category: "convert",
        seoTitle: "Image OCR to Text PDF Online Free",
        seoDescription: "Convert scanned images into searchable, selectable text PDFs using advanced OCR technology.",
        intent: "Users want to make text within an image searchable and selectable in a PDF.",
        keywords: [
            "screenshot ocr to pdf",
            "optical character recognition scan",
            "editable image text text layer"
        ],
        related: [
            "/pdf-to-text",
            "/images-to-pdf"
        ],
        faq: [
            {
                question: "Does this tool use OCR technology?",
                answer: "Yes, the tool utilizes smart Optical Character Recognition (OCR) to analyze the image and convert pixel text into selectable, searchable PDF text."
            },
            {
                question: "What languages does the text recognition support?",
                answer: "Our advanced OCR engine supports character recognition for a wide variety of global languages automatically."
            }
        ]
    },
    {
        title: "PDF Studio",
        description: "Edit, chain operations, process, reorganize layout topologies, and configure your PDF in one tool.",
        href: "/studio",
        category: "editing",
        seoTitle: "Advanced PDF Studio - All-in-One Editor",
        seoDescription: "A powerful all-in-one workspace to edit, merge, process, and completely manage your PDF documents online.",
        intent: "Users need a comprehensive workspace to do multiple operations on a PDF.",
        keywords: [
            "all in one pdf tool",
            "advanced layout editor",
            "pdf processing canvas workbench"
        ],
        related: [
            "/edit-pdf",
            "/merge-pdf"
        ],
        faq: [
            {
                question: "What can I do in the PDF Studio?",
                answer: "The Studio is a powerful, unified workspace where you can visually edit, rearrange, merge, delete, and process your PDFs simultaneously without switching tools."
            },
            {
                question: "Is it free to use the PDF Studio?",
                answer: "Yes, our advanced PDF processing canvas and all of its integrated features are completely free to use directly in your browser."
            }
        ]
    },
    {
        title: "Word to PDF",
        description: "Convert Word (.docx, .doc) documents into standard printable vector PDFs instantly.",
        href: "/word-to-pdf",
        category: "convert",
        seoTitle: "Convert Word to PDF Online Free",
        seoDescription: "Turn Microsoft Word documents into PDF files securely while preserving all original formatting.",
        intent: "Users want to securely share a Word document by converting it to PDF format.",
        keywords: [
            "convert docx to pdf",
            "ms word template to pdf",
            "office formats translator"
        ],
        related: [
            "/pdf-to-word",
            "/excel-to-pdf"
        ],
        isNew: true,
        faq: [
            {
                question: "Will my Word formatting be preserved?",
                answer: "Yes, converting your DOCX or DOC file to PDF ensures your fonts, custom layouts, and formatting remain exactly as they appear in Word."
            },
            {
                question: "Can I convert older .doc files?",
                answer: "Yes, both modern .docx formats and older .doc legacy file formats are fully supported by our converter."
            }
        ]
    },
    {
        title: "Excel to PDF",
        description: "Convert Excel (.xlsx, .xls) sheets and grid data directly into standard printable vector PDFs.",
        href: "/excel-to-pdf",
        category: "convert",
        seoTitle: "Convert Excel to PDF Online Free",
        seoDescription: "Transform Excel spreadsheets into easily readable and printable PDF documents instantly.",
        intent: "Users want to lock spreadsheet data into a fixed PDF view.",
        keywords: [
            "flatten spreadsheet calculation",
            "convert xlsx table to document",
            "printable tabular layout map"
        ],
        related: [
            "/pdf-to-excel",
            "/word-to-pdf"
        ],
        isNew: true,
        faq: [
            {
                question: "Will all my spreadsheet tabs convert to PDF?",
                answer: "Yes, the conversion process can intelligently capture your active sheets and translate them into sequential PDF pages."
            },
            {
                question: "How does the tool handle very wide tables?",
                answer: "The converter scales your tabular data responsibly to fit standard vector PDF page layouts cleanly without aggressive cropping."
            }
        ]
    },
    {
        title: "PowerPoint to PDF",
        description: "Convert PowerPoint (.pptx, .ppt) pitch slide decks into standard vector PDF presentation frames.",
        href: "/powerpoint-to-pdf",
        category: "convert",
        seoTitle: "Convert PowerPoint to PDF Online Free",
        seoDescription: "Save your PPT and PPTX presentation slides as static PDF files easily and securely.",
        intent: "Users want to share presentations in a universally viewable PDF format.",
        keywords: [
            "export pptx to presentation",
            "slides file to layout package",
            "pitch layout template saver"
        ],
        related: [
            "/pdf-to-powerpoint",
            "/word-to-pdf"
        ],
        isNew: true,
        faq: [
            {
                question: "Will animations from my presentation carry over?",
                answer: "Dynamic animations are not supported in standard PDFs, but each slide's final visual state will be perfectly preserved as a static, high-quality vector page."
            },
            {
                question: "Are speaker notes included in the PDF?",
                answer: "The standard conversion focuses entirely on the presentation slides themselves, outputting them purely as standard presentation frames."
            }
        ]
    },
    {
        title: "URL to PDF Website Capture",
        description: "Input a live webpage link to render, scrape, and capture the DOM viewport directly into a printable vector PDF template document.",
        href: "/url-to-pdf",
        category: "convert",
        seoTitle: "Convert URL Website to PDF Online Free",
        seoDescription: "Capture any live webpage and save it as a high-quality, printable PDF document instantly.",
        intent: "Users want to save a web page as a PDF for offline viewing or archiving.",
        keywords: [
            "html snapshot download",
            "save full webpage as pdf",
            "render dom layout blueprint"
        ],
        related: [
            "/markdown-to-pdf",
            "/code-to-pdf"
        ],
        isNew: true,
        faq: [
            {
                question: "How does the website capture work?",
                answer: "Simply paste a live HTTP URL, and our secure backend tool will render and snapshot the entire webpage layout natively into a PDF."
            },
            {
                question: "Can I capture pages that require a login?",
                answer: "The tool engine can only capture publicly accessible webpages that do not require active user authentication or paywall bypasses."
            }
        ]
    },
    {
        title: "Markdown to PDF",
        description: "Convert documentation markdown files (.md) into clean, typography-focused stylized portrait vector PDFs.",
        href: "/markdown-to-pdf",
        category: "convert",
        seoTitle: "Convert Markdown to PDF Online Free",
        seoDescription: "Render MD files into beautiful, formatted PDF documents with proper typography and layouts.",
        intent: "Users want to turn plain text markdown into a visually appealing document.",
        keywords: [
            "render md notes to print",
            "markdown formatting compiler",
            "tech documentation layouts build"
        ],
        related: [
            "/code-to-pdf",
            "/word-to-pdf"
        ],
        isNew: true,
        faq: [
            {
                question: "Are markdown formatting styles like tables and code blocks supported?",
                answer: "Yes, the tool completely and accurately renders all standard markdown syntax, including tables and blockquotes, into clean typography."
            },
            {
                question: "Does the output look professional?",
                answer: "Absolutely. The tool utilizes a clean, professional default typography focus designed specifically for optimal reading and technical documentation."
            }
        ]
    },
    {
        title: "Source Code to PDF",
        description: "Convert development script source files into clean syntax-highlighted printable vector layout sheets.",
        href: "/code-to-pdf",
        category: "convert",
        seoTitle: "Convert Source Code to PDF Online Free",
        seoDescription: "Format programming code files into beautiful PDFs with full syntax highlighting and line numbers.",
        intent: "Users want to print or share code snippets in a readable, formatted way.",
        keywords: [
            "programming syntax highlighted sheets",
            "source script formatting code snapshot",
            "save repository logs"
        ],
        related: [
            "/markdown-to-pdf",
            "/url-to-pdf"
        ],
        isNew: true,
        faq: [
            {
                question: "Will my code's syntax highlighting be preserved?",
                answer: "Yes, the tool automatically detects your programming language and applies clean, professional syntax color highlighting to the output."
            },
            {
                question: "Does the PDF support line numbers?",
                answer: "Yes, the printable vector layout sheets format your code cleanly and automatically generate structured line numbering."
            }
        ]
    },
    {
        title: "Secure Redaction",
        description: "Permanently scrub and strip explicit textual reference target vectors entirely out of underlying objects properties.",
        href: "/redact-pdf",
        category: "security",
        seoTitle: "Redact PDF Online Free - Hide Sensitive Text",
        seoDescription: "Securely black out and permanently redact sensitive information from your PDF documents.",
        intent: "Users need to permanently hide confidential information in a PDF.",
        keywords: [
            "blackout sensitive information",
            "sanitize pdf content fields",
            "censor document record layers"
        ],
        related: [
            "/lock-pdf",
            "/edit-metadata"
        ],
        faq: [
            {
                question: "Is the redacted text permanently removed?",
                answer: "Yes, the tool permanently scrubs the explicit textual data entirely out of the document's code, ensuring it cannot be recovered or copy-pasted."
            },
            {
                question: "Can I redact images as well as text?",
                answer: "The primary tool focus is permanently blacking out explicit sensitive text fields and record layers securely."
            }
        ]
    },
    {
        title: "PDF Editor",
        description: "Modify explicit text components inline coordinates matrices while preserving format matrix loops seamlessly.",
        href: "/edit-pdf",
        category: "editing",
        seoTitle: "Edit PDF Online Free - Full Document Editor",
        seoDescription: "Edit text, add shapes, insert images, and modify your PDF directly in your browser.",
        intent: "Users want to make direct text or layout changes to an existing PDF.",
        keywords: [
            "precision text coordinate overwrite",
            "modify vector string frames",
            "patch structural layer inline"
        ],
        related: [
            "/studio",
            "/sign-pdf"
        ],
        faq: [
            {
                question: "Can I edit existing text in my PDF?",
                answer: "Yes, you can select and modify text components and their inline coordinates directly within the document."
            },
            {
                question: "Does the editor support custom fonts?",
                answer: "You can add new text using standard system fonts, and modify existing strings while preserving the document's internal layout matrix seamlessly."
            }
        ]
    },
    {
        title: "PDF to Excel",
        description: "Extract data metrics and convert embedded calculation tabular columns out of document sections into structured Excel sheets.",
        href: "/pdf-to-excel",
        category: "convert",
        seoTitle: "Convert PDF to Excel Online Free",
        seoDescription: "Accurately convert PDF tables and data into editable Excel spreadsheets quickly and securely.",
        intent: "Users want to pull tabular data from a PDF into a working spreadsheet.",
        keywords: [
            "convert pdf to spreadsheet table",
            "unflatten grid values columns data",
            "reclaim financial files parameters"
        ],
        related: [
            "/excel-to-pdf",
            "/pdf-to-word"
        ],
        faq: [
            {
                question: "Will it maintain my table columns and rows?",
                answer: "Yes, the intelligent tool is designed to extract embedded tabular data arrays and seamlessly map them into structured Excel grid cells."
            },
            {
                question: "Can it extract data from scanned PDFs?",
                answer: "If the PDF contains native vector text formatting, data is extracted flawlessly. Entirely flattened images require advanced OCR capability."
            }
        ]
    },
    {
        title: "PDF to Word",
        description: "Transform uneditable flat layout parameters back into fluid selectable Microsoft Word document properties.",
        href: "/pdf-to-word",
        category: "convert",
        seoTitle: "Convert PDF to Word Online Free",
        seoDescription: "Convert PDF documents to fully editable Microsoft Word DOCX files while keeping the formatting.",
        intent: "Users want to convert a PDF back into a Word document for extensive text editing.",
        keywords: [
            "convert pdf to editable text text document",
            "translate vector page files format back to docx",
            "unprotect locked elements streams"
        ],
        related: [
            "/word-to-pdf",
            "/pdf-to-text"
        ],
        faq: [
            {
                question: "Can I edit the converted Word document?",
                answer: "Yes, the tool actively transforms the static PDF layout parameters back into a fully fluid, selectable, and editable Microsoft Word file."
            },
            {
                question: "Will complex layouts like columns be kept intact?",
                answer: "Our advanced converter intelligently reconstructs vector page layouts, including columns and margins, back into accurate document properties."
            }
        ]
    },
    {
        title: "PDF to PowerPoint",
        description: "Transform presentation data frames back into entirely editable Microsoft PowerPoint pitch layout slides structures.",
        href: "/pdf-to-powerpoint",
        category: "convert",
        seoTitle: "Convert PDF to PowerPoint Online Free",
        seoDescription: "Turn your PDF pages into fully editable PowerPoint slides for your next presentation.",
        intent: "Users want to rebuild presentation slides from a PDF file.",
        keywords: [
            "rebuild pptx files sequences",
            "extract vector presentation decks",
            "convert slides from document books"
        ],
        related: [
            "/powerpoint-to-pdf",
            "/pdf-to-word"
        ],
        faq: [
            {
                question: "Can I edit the slides in PowerPoint after conversion?",
                answer: "Yes, the PDF presentation data frames are converted back into entirely editable text and graphic shape structures in PowerPoint."
            },
            {
                question: "Are images in the PDF transferred to the presentation?",
                answer: "Yes, all vector graphics, raster images, and text are accurately extracted and placed onto the appropriate sequence layout slides."
            }
        ]
    },
    {
        title: "Grayscale PDF",
        description: "Remove color tracks from your files to optimize printing consumption parameters and drop server weights paths.",
        href: "/grayscale-pdf",
        category: "convert",
        seoTitle: "Convert PDF to Grayscale Online Free",
        seoDescription: "Easily convert color PDF documents to black and white or grayscale to save ink and reduce file size.",
        intent: "Users want to remove color from a PDF to save printer ink.",
        keywords: [
            "convert black and white pdf",
            "strip document tint profiles color layer fields",
            "save printing machinery ink metrics"
        ],
        related: [
            "/compress-pdf"
        ],
        faq: [
            {
                question: "What does converting to grayscale do?",
                answer: "It removes all color profiles from your PDF, leaving only black, white, and gray tones, which is perfect for optimizing printer ink consumption."
            },
            {
                question: "Does grayscale conversion reduce file size?",
                answer: "Yes, stripping the color profiles and rich color layer fields out of the document often results in a significantly optimized file size."
            }
        ]
    },
    {
        title: "Repair PDF",
        description: "Rebuild cross reference tables and fix damaged dictionary tree layouts components so they open without corruption warnings.",
        href: "/repair-pdf",
        category: "editing",
        seoTitle: "Repair Corrupted PDF Online Free",
        seoDescription: "Repair damaged PDF files and restore documents that fail to open.",
        intent: "Users need to recover broken PDF files.",
        keywords: [
            "repair pdf",
            "fix corrupted pdf",
            "recover pdf file"
        ],
        related: [
            "/compress-pdf",
            "/edit-metadata"
        ],
        faq: [
            {
                question: "What kind of PDF damage can be fixed?",
                answer: "The tool attempts to rebuild cross-reference tables and fix corrupted dictionary layout trees that cause files to fail to open correctly."
            },
            {
                question: "Will repairing the PDF recover all my lost data?",
                answer: "While it actively recovers broken document structures, severely truncated or fully overwritten file data bytes might not be completely salvageable."
            }
        ]
    },
    {
        title: "Sign On PDF",
        description: "Add signatures to PDF documents with a simple online signing tool.",
        href: "/sign-pdf",
        category: "editing",
        seoTitle: "Sign PDF Online Free",
        seoDescription: "Add electronic signatures to PDF documents quickly and securely.",
        intent: "Users want to sign PDF documents digitally.",
        keywords: [
            "sign pdf",
            "electronic signature pdf",
            "esign pdf"
        ],
        related: [
            "/lock-pdf",
            "/edit-pdf"
        ],
        faq: [
            {
                question: "Is it secure to sign a PDF online?",
                answer: "Yes, your document is processed securely in the browser, allowing you to add signatures safely without permanently storing your files."
            },
            {
                question: "Can I draw my signature on a mobile device?",
                answer: "Yes, you can easily use your touchscreen, mouse, or trackpad to draw custom signature layers directly onto the page layout tracks."
            }
        ]
    }
];