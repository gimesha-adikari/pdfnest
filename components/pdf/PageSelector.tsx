interface PageSelectorProps {
    numPages: number;
    selectedPages: number[];
    onTogglePage: (pageNumber: number) => void;
    onSelectAll: () => void;
    onClear: () => void;
}

export default function PageSelector({
                                         numPages,
                                         selectedPages,
                                         onTogglePage,
                                         onSelectAll,
                                         onClear,
                                     }: PageSelectorProps) {
    return (
        <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">
                    Select Pages
                </h3>

                <div className="flex gap-2">
                    <button
                        onClick={onSelectAll}
                        className="
                            rounded-lg
                            border
                            border-[color:var(--border)]
                            px-4
                            py-2
                        "
                    >
                        Select All
                    </button>

                    <button
                        onClick={onClear}
                        className="
                            rounded-lg
                            border
                            border-[color:var(--border)]
                            px-4
                            py-2
                        "
                    >
                        Clear
                    </button>
                </div>
            </div>

            <p className="mt-2 text-sm text-[color:var(--muted)]">
                Selected: {selectedPages.length} page(s)
            </p>

            <p className="mt-1 text-sm text-[color:var(--muted)]">
                PDF contains {numPages} pages
            </p>

            <div className="mt-6">
                <div
                    className="
                        grid
                        grid-cols-4
                        gap-3
                        md:grid-cols-6
                        lg:grid-cols-8
                    "
                >
                    {Array.from(
                        { length: numPages },
                        (_, i) => {
                            const pageNumber = i + 1;

                            const selected =
                                selectedPages.includes(
                                    pageNumber
                                );

                            return (
                                <button
                                    key={pageNumber}
                                    onClick={() =>
                                        onTogglePage(
                                            pageNumber
                                        )
                                    }
                                    className={`
                                        h-14
                                        rounded-xl
                                        border
                                        font-semibold
                                        transition

                                        ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-600 text-white"
                                            : "border-[color:var(--border)] hover:border-indigo-400"
                                    }
                                    `}
                                >
                                    {pageNumber}
                                </button>
                            );
                        }
                    )}
                </div>
            </div>
        </div>
    );
}