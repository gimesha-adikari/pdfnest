interface PdfToolHeroProps {
    title: string;
    description: string;
}

export default function PdfToolHero({
                                        title,
                                        description,
                                    }: PdfToolHeroProps) {
    return (
        <div className="text-center">
            <h1 className="text-5xl font-black">
                {title}
            </h1>

            <p className="mt-4 text-lg text-[color:var(--muted)]">
                {description}
            </p>
        </div>
    );
}