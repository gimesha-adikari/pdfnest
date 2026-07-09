import {Rnd} from "react-rnd";
import {useState} from "react";

export function DraggableSignaturePlaceholder({
                                           signatureUrl,
                                           initialX,
                                           initialY,
                                           initialWidth,
                                           initialHeight,
                                           onPositionChange,
                                           onRemove,
                                       }: {
    signatureUrl: string;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
    onPositionChange: (x:number,y:number,w:number,h:number)=>void;
    onRemove: ()=>void;
}) {
    const [position, setPosition] = useState({
        x: initialX,
        y: initialY,
    });

    const [size, setSize] = useState({
        width: initialWidth,
        height: initialHeight,
    });

    return (
        <Rnd
            bounds="parent"
            position={position}
            size={size}
            minWidth={60}
            minHeight={20}
            lockAspectRatio
            onDragStop={(e, d) => {
                const next = {
                    x: d.x,
                    y: d.y,
                };

                setPosition(next);

                onPositionChange(
                    next.x,
                    next.y,
                    size.width,
                    size.height
                );
            }}
            onResizeStop={(e, dir, ref, delta, pos) => {
                const nextSize = {
                    width: ref.offsetWidth,
                    height: ref.offsetHeight,
                };

                setPosition(pos);
                setSize(nextSize);

                onPositionChange(
                    pos.x,
                    pos.y,
                    nextSize.width,
                    nextSize.height
                );
            }}
            className="border border-indigo-500 rounded-md shadow-lg bg-white/10"
        >
            <img
                src={signatureUrl}
                className="w-full h-full object-contain pointer-events-none"
                alt=""
            />

            <button
                type="button"
                onClick={onRemove}
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-xs"
            >
                ×
            </button>
        </Rnd>
    );
}
