"use client";

import {
    DndContext,
    closestCenter,
} from "@dnd-kit/core";

import {
    SortableContext,
    rectSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";

import SortablePageCard from "./SortablePageCard";

interface PageItem {
    id: string;
    pageNumber: number;
    thumbnail: string;
}

interface Props {
    pages: PageItem[];
    setPages: React.Dispatch<
        React.SetStateAction<PageItem[]>
    >;
}

export default function PageReorderGrid({
                                            pages,
                                            setPages,
                                        }: Props) {
    const handleDragEnd = (
        event: any
    ) => {
        const {
            active,
            over,
        } = event;

        if (
            !over ||
            active.id === over.id
        ) {
            return;
        }

        setPages((items) => {
            const oldIndex =
                items.findIndex(
                    (item) =>
                        item.id === active.id
                );

            const newIndex =
                items.findIndex(
                    (item) =>
                        item.id === over.id
                );

            return arrayMove(
                items,
                oldIndex,
                newIndex
            );
        });
    };

    return (
        <DndContext
            collisionDetection={
                closestCenter
            }
            onDragEnd={
                handleDragEnd
            }
        >
            <SortableContext
                items={pages.map(
                    (p) => p.id
                )}
                strategy={
                    rectSortingStrategy
                }
            >
                <div
                    className="
                        mt-8
                        grid
                        gap-4
                        sm:grid-cols-2
                        lg:grid-cols-4
                    "
                >
                    {pages.map((page) => (
                        <SortablePageCard
                            key={page.id}
                            id={page.id}
                            pageNumber={
                                page.pageNumber
                            }
                            thumbnail={
                                page.thumbnail
                            }
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}