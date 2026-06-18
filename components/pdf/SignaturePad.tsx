"use client";

import { useRef, useState, useEffect } from "react";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
    onSignatureChange: (blob: Blob | null) => void;
}

export default function SignaturePad({ onSignatureChange }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isEmpty, setIsEmpty] = useState(true);

    // Set up canvas context for smooth drawing
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#000000"; // Black ink
    }, []);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        draw(e);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx?.beginPath();

        // Convert the drawing to a PNG Blob and send it up to the parent component
        canvas.toBlob((blob) => {
            if (blob) onSignatureChange(blob);
        }, "image/png");
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Calculate exact mouse/touch position relative to the canvas
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;

        if ("touches" in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsEmpty(false);
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        setIsEmpty(true);
        onSignatureChange(null);
    };

    return (
        <div className="space-y-3">
            <div className="relative border-2 border-dashed border-border rounded-xl bg-white overflow-hidden touch-none">
                {isEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[color:var(--muted)] text-sm font-medium">
                        Draw your signature here
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    className="w-full h-37.5 cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseUp={stopDrawing}
                    onMouseMove={draw}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchEnd={stopDrawing}
                    onTouchMove={draw}
                />
            </div>

            {!isEmpty && (
                <button onClick={clearSignature} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium transition-colors">
                    <Eraser size={14} /> Clear Signature
                </button>
            )}
        </div>
    );
}