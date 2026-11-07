"use client";

import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import SortablePageCard from "./SortablePageCard";

interface Props {
    items: number[];
    setItems: React.Dispatch<React.SetStateAction<number[]>>;
    thumbnails?: string[];
    file?: File | null;
}

export default function PageReorderGrid({ items, setItems, thumbnails = [], file }: Props) {
    const [isMounted, setIsMounted] = useState(false);
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true);
    }, []);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) {
            return;
        }

        setItems((prevItems) => {
            const oldIndex = prevItems.indexOf(Number(active.id));
            const newIndex = prevItems.indexOf(Number(over.id));

            return arrayMove(prevItems, oldIndex, newIndex);
        });
    };

    if (!isMounted) {
        return (
            <div className="min-h-50 flex items-center justify-center text-sm text-muted">
                Initializing interactive grid...
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{
                screenReaderInstructions: {
                    draggable: "To reorder a page, focus its card and press Space. Use the arrow keys to move it, Space to drop, or Escape to cancel.",
                },
                announcements: {
                    onDragStart: ({ active }) => `Picked up page ${active.id}. Use arrow keys to choose its position.`,
                    onDragOver: ({ active, over }) => over
                        ? `Page ${active.id} is in position ${items.indexOf(Number(over.id)) + 1} of ${items.length}.`
                        : `Page ${active.id} is not over a page position.`,
                    onDragEnd: ({ active, over }) => over
                        ? `Page ${active.id} was moved to position ${items.indexOf(Number(over.id)) + 1} of ${items.length}.`
                        : `Page ${active.id} was dropped without changing its position.`,
                    onDragCancel: ({ active }) => `Reordering page ${active.id} was cancelled.`,
                },
            }}
        >
            <SortableContext items={items} strategy={rectSortingStrategy}>
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((pageNum) => (
                        <SortablePageCard
                            key={pageNum}
                            id={pageNum}
                            pageNumber={pageNum}
                            thumbnail={thumbnails[pageNum - 1]}
                            file={file}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
