"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import LazyPdfThumbnail from "@/components/pdf/LazyPdfThumbnail";

interface Props {
    id: number;
    pageNumber: number;
    thumbnail?: string;
    file?: File | null;
}

export default function SortablePageCard({
                                             id,
                                             pageNumber,
                                             thumbnail,
                                             file,
                                         }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({
        id,
    });

    const style = {
        transform:
            CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="
                overflow-hidden
                rounded-2xl
                border
                border-[color:var(--border)]
                bg-[var(--background)]
                shadow-sm
                cursor-grab
                active:cursor-grabbing
            "
        >
            <div className="aspect-[3/4]">
                {file ? (
                    <LazyPdfThumbnail file={file} page={pageNumber} scale={0.3} className="h-full w-full">
                        {({ src, isLoading }) =>
                            src ? (
                                <img
                                    src={src}
                                    alt={`Page ${pageNumber}`}
                                    className="h-full w-full object-contain"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--muted)]">
                                    {isLoading ? "Loading..." : `Page ${pageNumber}`}
                                </div>
                            )
                        }
                    </LazyPdfThumbnail>
                ) : (
                    <img
                        src={thumbnail}
                        alt={`Page ${pageNumber}`}
                        className="h-full w-full object-contain"
                    />
                )}
            </div>

            <div className="p-4 text-center font-semibold">
                Page {pageNumber}
            </div>
        </div>
    );
}