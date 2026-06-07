interface PdfToolLayoutProps {
    children: React.ReactNode;
}

export default function PdfToolLayout({
                                          children,
                                      }: PdfToolLayoutProps) {
    return (
        <div className="mx-auto max-w-5xl px-6 py-16">
            {children}
        </div>
    );
}