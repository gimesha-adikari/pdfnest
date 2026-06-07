interface PdfFileInfoProps {
    file: File;
}

export default function PdfFileInfo({
                                        file,
                                    }: PdfFileInfoProps) {
    return (
        <div
            className="
                rounded-xl
                border
                border-[color:var(--border)]
                bg-[var(--card)]
                p-4
            "
        >
            <div className="flex items-center gap-3">
                <div
                    className="
                        flex
                        h-12
                        w-12
                        items-center
                        justify-center
                        rounded-xl
                        bg-gradient-to-r
                        from-red-500
                        to-pink-500
                        text-white
                        font-bold
                    "
                >
                    PDF
                </div>

                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                        {file.name}
                    </p>

                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                </div>
            </div>
        </div>
    );
}