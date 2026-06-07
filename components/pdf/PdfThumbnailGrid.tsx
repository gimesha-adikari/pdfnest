import PdfPageThumbnail from "./PdfPageThumbnail";

interface PdfThumbnailGridProps {
    thumbnails: string[];
    selectedPages: number[];
    onTogglePage: (page: number) => void;
}

export default function PdfThumbnailGrid({
                                             thumbnails,
                                             selectedPages,
                                             onTogglePage,
                                         }: PdfThumbnailGridProps) {
    return (
        <div className="mt-8">
            <h3 className="mb-4 text-xl font-semibold">
                Page Preview
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {thumbnails.map((thumbnail, index) => {
                    const pageNumber = index + 1;

                    const selected =
                        selectedPages.includes(pageNumber);

                    return (
                        <PdfPageThumbnail
                            key={pageNumber}
                            thumbnail={thumbnail}
                            pageNumber={pageNumber}
                            selected={selected}
                            onClick={() =>
                                onTogglePage(pageNumber)
                            }
                        />
                    );
                })}
            </div>
        </div>
    );
}