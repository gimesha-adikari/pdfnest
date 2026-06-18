"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

interface DraggableSignatureProps {
    signatureUrl: string;
    containerRef: React.RefObject<HTMLDivElement | null>;
    initialX?: number; // NEW
    initialY?: number; // NEW
    onPositionChange: (x: number, y: number, width: number, height: number) => void;
    onRemove: () => void;
}

export default function DraggableSignature({ signatureUrl, containerRef, initialX = 50, initialY = 50, onPositionChange, onRemove }: DraggableSignatureProps) {
    // Initialize with the saved position instead of a hardcoded 50,50
    const [position, setPosition] = useState({ x: initialX, y: initialY });
    const [isDragging, setIsDragging] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);
    const dragOffset = useRef({ x: 0, y: 0 });

    // The rest of your component remains exactly the same!
    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        const rect = elementRef.current?.getBoundingClientRect();
        if (rect) {
            dragOffset.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        }
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !containerRef.current || !elementRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        let newX = e.clientX - containerRect.left - dragOffset.current.x;
        let newY = e.clientY - containerRect.top - dragOffset.current.y;

        const maxX = containerRect.width - elementRef.current.offsetWidth;
        const maxY = containerRect.height - elementRef.current.offsetHeight;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        setPosition({ x: newX, y: newY });
        onPositionChange(newX, newY, elementRef.current.offsetWidth, elementRef.current.offsetHeight);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    return (
        <div
            ref={elementRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ left: position.x, top: position.y }}
            className={`absolute cursor-move touch-none group p-1 border-2 border-dashed ${
                isDragging ? "border-indigo-500 bg-indigo-500/10" : "border-transparent hover:border-gray-400"
            } rounded-lg transition-colors`}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <X size={12} />
            </button>
            <img src={signatureUrl} alt="Your Signature" className="w-[150px] pointer-events-none select-none" />
        </div>
    );
}