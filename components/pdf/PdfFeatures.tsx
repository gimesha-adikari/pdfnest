export default function PdfFeatures() {
    const features = [
        {
            title: "Zero Trust Privacy",
            description: "Files are processed in isolated memory and never stored permanently.",
        },
        {
            title: "Instant Execution",
            description: "Fast in-browser engines compile and transform your documents locally.",
        },
        {
            title: "No Account Required",
            description: "Access precision document utilities instantly with zero upfront friction.",
        },
    ];

    return (
        <div className="mt-14 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
                <div
                    key={feature.title}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-5 hover:border-[var(--muted)] transition-colors shadow-sm"
                >
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] font-mono">
                        {feature.title}
                    </h3>

                    <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
                        {feature.description}
                    </p>
                </div>
            ))}
        </div>
    );
}