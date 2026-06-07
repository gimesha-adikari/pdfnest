interface PdfFileItemProps {
    file: File;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onRemove: () => void;
}

export default function PdfFileItem({
                                        file,
                                        index,
                                        isFirst,
                                        isLast,
                                        onMoveUp,
                                        onMoveDown,
                                        onRemove,
                                    }: PdfFileItemProps) {
    return (
        <div
            className="
        flex
        items-center
        justify-between
        rounded-xl
        border
        border-[color:var(--border)]
        p-4
      "
        >
            <div>
                <p className="font-semibold">
                    #{index + 1} • {file.name}
                </p>

                <p className="text-sm text-[color:var(--muted)]">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onMoveUp}
                    aria-label="Move file up"
                    disabled={isFirst}
                    className="
            rounded-lg
            border
            border-[color:var(--border)]
            px-3
            py-2
            disabled:opacity-30
          "
                >
                    ↑
                </button>

                <button
                    onClick={onMoveDown}
                    aria-label="Move file down"
                    disabled={isLast}
                    className="
            rounded-lg
            border
            border-[color:var(--border)]
            px-3
            py-2
            disabled:opacity-30
          "
                >
                    ↓
                </button>

                <button
                    onClick={onRemove}
                    className="
            rounded-lg
            bg-red-500
            px-3
            py-2
            text-white
            hover:bg-red-600
          "
                >
                    Remove
                </button>
            </div>
        </div>
    );
}