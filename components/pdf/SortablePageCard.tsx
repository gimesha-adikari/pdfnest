"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
    id: number;
    pageNumber: number;
    thumbnail: string;
}

export default function SortablePageCard({
                                             id,
                                             pageNumber,
                                             thumbnail,
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
                <img
                    src={thumbnail}
                    alt={`Page ${pageNumber}`}
                    className="h-full w-full object-contain"
                />
            </div>

            <div className="p-4 text-center font-semibold">
                Page {pageNumber}
            </div>
        </div>
    );
}