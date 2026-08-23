export default function Stat({
                                 title,
                                 value,
                             }: {
    title: string;
    value: number;
}) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-4 text-center hover:border-[var(--muted)] transition-colors shadow-sm">
            <div className="text-2xl font-bold font-mono text-[var(--foreground)]">{value}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {title}
            </div>
        </div>
    );
}