import PdfFileItem from "./PdfFileItem";

interface PdfFileListProps {
    files: File[];
    totalSizeMB: string;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onRemove: (index: number) => void;
    onClear: () => void;
}

export default function PdfFileList({
                                        files,
                                        totalSizeMB,
                                        onMoveUp,
                                        onMoveDown,
                                        onRemove,
                                        onClear,
                                    }: PdfFileListProps) {
    return (
        <div className="mt-8">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                    Selected Files ({files.length})
                </h3>

                <button
                    onClick={onClear}
                    className="
            rounded-lg
            bg-red-500
            px-4
            py-2
            text-sm
            text-white
            hover:bg-red-600
          "
                >
                    Clear All
                </button>
            </div>

            <p className="mt-2 text-sm text-[color:var(--muted)]">
                Total Size: {totalSizeMB} MB
            </p>

            <div className="mt-4 space-y-3">
                {files.map((file, index) => (
                    <PdfFileItem
                        key={`${file.name}-${index}`}
                        file={file}
                        index={index}
                        isFirst={index === 0}
                        isLast={index === files.length - 1}
                        onMoveUp={() => onMoveUp(index)}
                        onMoveDown={() => onMoveDown(index)}
                        onRemove={() => onRemove(index)}
                    />
                ))}
            </div>
        </div>
    );
}