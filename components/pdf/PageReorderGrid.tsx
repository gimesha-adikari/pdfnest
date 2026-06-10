"use client";

import { useState, useEffect } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import SortablePageCard from "./SortablePageCard";

interface Props {
    items: number[];
    setItems: React.Dispatch<React.SetStateAction<number[]>>;
    thumbnails: string[];
}

export default function PageReorderGrid({ items, setItems, thumbnails }: Props) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleDragEnd = (event: any) => {
        const { active, over } = event;

        if (!over || active.id === over.id) {
            return;
        }

        setItems((prevItems) => {
            const oldIndex = prevItems.indexOf(active.id);
            const newIndex = prevItems.indexOf(over.id);
            return arrayMove(prevItems, oldIndex, newIndex);
        });
    };

    if (!isMounted) {
        return (
            <div className="min-h-[200px] flex items-center justify-center text-sm text-[color:var(--muted)]">
                Initializing interactive grid...
            </div>
        );
    }

    return (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={rectSortingStrategy}>
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((pageNum) => (
                        <SortablePageCard
                            key={pageNum}
                            id={pageNum}
                            pageNumber={pageNum}
                            thumbnail={thumbnails[pageNum - 1]}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}