export default function PdfFeatures() {
    const features = [
        {
            title: "100% Browser Based",
            description: "Files never leave your device.",
        },
        {
            title: "Fast Processing",
            description: "Merge documents instantly.",
        },
        {
            title: "No Registration",
            description: "Use the tool completely free.",
        },
    ];

    return (
        <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
                <div
                    key={feature.title}
                    className="
            rounded-2xl
            border
            border-[color:var(--border)]
            bg-[var(--card)]
            p-6
          "
                >
                    <h3 className="font-bold">
                        {feature.title}
                    </h3>

                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                        {feature.description}
                    </p>
                </div>
            ))}
        </div>
    );
}