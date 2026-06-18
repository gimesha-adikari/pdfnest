export default function Stat({
                                 title,
                                 value,
                             }: {
    title: string;
    value: number;
}) {
    return (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4 text-center">
            <div className="text-2xl font-black">{value}</div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
                {title}
            </div>
        </div>
    );
}