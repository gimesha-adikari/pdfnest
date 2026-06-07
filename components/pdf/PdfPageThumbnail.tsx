interface PdfPageThumbnailProps {
    thumbnail: string;
    pageNumber: number;
    selected: boolean;
    onClick: () => void;
}

export default function PdfPageThumbnail({
                                             thumbnail,
                                             pageNumber,
                                             selected,
                                             onClick,
                                         }: PdfPageThumbnailProps) {
    return (
        <button
            onClick={onClick}
            className={`
                overflow-hidden
                rounded-2xl
                border
                transition-all

                ${
                selected
                    ? "border-indigo-500 ring-2 ring-indigo-500"
                    : "border-[color:var(--border)]"
            }
            `}
        >
            <img
                src={thumbnail}
                alt={`Page ${pageNumber}`}
                className="w-full"
            />

            <div
                className={`
                    p-3
                    text-center
                    text-sm
                    font-medium

                    ${
                    selected
                        ? "bg-indigo-600 text-white"
                        : ""
                }
                `}
            >
                Page {pageNumber}
            </div>
        </button>
    );
}