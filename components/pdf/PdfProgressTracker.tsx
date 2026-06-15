"use client";

import React, { useEffect, useState } from "react";

interface ProgressPayload {
    progress: number;
    status: string;
}

export function PdfProgressTracker({ taskId, onComplete }: { taskId: string; onComplete: (downloadUrl: string) => void }) {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("Initializing dynamic sockets engine...");

    useEffect(() => {
        const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
        const baseWsUrl = baseApiUrl.replace(/^http/, "ws");

        const ws = new WebSocket(`${baseWsUrl}/api/v1/tasks/${taskId}/progress`);

        ws.onmessage = (event) => {
            try {
                const data: ProgressPayload = JSON.parse(event.data);
                setProgress(data.progress);
                setStatus(data.status || "Executing matrix actions...");

                if (data.progress === 100) {
                    onComplete(`/api/v1/download/${taskId}`);
                    ws.close();
                }
            } catch (err) {
                console.error("Failed to parse websocket frame context:", err);
            }
        };

        ws.onerror = () => {
            setStatus("Workspace socket loop disconnected unexpectedly.");
        };

        return () => {
            ws.close();
        };
    }, [taskId, onComplete]);

    return (
        <div className="w-full max-w-md p-6 bg-card border border-[color:var(--border)] rounded-lg shadow-sm">
            <h3 className="text-sm font-semibold mb-2 text-[color:var(--foreground)]">{status}</h3>
            <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
                <div
                    className="bg-primary h-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <span className="text-xs text-muted-foreground mt-1 block text-right">{progress}%</span>
        </div>
    );
}