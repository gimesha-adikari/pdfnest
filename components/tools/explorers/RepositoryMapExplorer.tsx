import React, { useState } from "react";
import { CanonicalAnalysisResult, StructureNode } from "../../../types/analyzer";
import { Folder, File, ChevronRight, ChevronDown, Database } from "lucide-react";

interface RepositoryMapExplorerProps {
    result: CanonicalAnalysisResult;
}

export default function RepositoryMapExplorer({ result }: RepositoryMapExplorerProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["/"]));

    const toggleFolder = (path: string) => {
        const next = new Set(expandedFolders);
        if (next.has(path)) {
            next.delete(path);
        } else {
            next.add(path);
        }
        setExpandedFolders(next);
    };

    const renderNode = (node: StructureNode, depth = 0) => {
        const isDir = node.type === "directory";
        const isExpanded = expandedFolders.has(node.path);
        const paddingLeft = `${depth * 1.5 + 0.5}rem`;

        return (
            <div key={node.path} className="flex flex-col">
                <button
                    type="button"
                    onClick={() => isDir && toggleFolder(node.path)}
                    className={`flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--accent)] text-left transition-colors rounded-lg group ${
                        !isDir ? "cursor-default" : "cursor-pointer"
                    }`}
                    style={{ paddingLeft }}
                >
                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        {isDir && (
                            <span className="text-[color:var(--muted-foreground)] group-hover:text-[color:var(--foreground)] transition-colors">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                        )}
                    </div>
                    
                    {isDir ? (
                        <Folder size={16} className={isExpanded ? "text-blue-500" : "text-blue-400"} />
                    ) : (
                        <File size={16} className="text-gray-400" />
                    )}
                    
                    <span className="text-sm font-medium text-[color:var(--foreground)] truncate">
                        {node.name}
                    </span>

                    {node.size && !isDir && (
                        <span className="ml-auto text-[10px] text-[color:var(--muted-foreground)] shrink-0 font-mono">
                            {(node.size / 1024).toFixed(1)} KB
                        </span>
                    )}
                    {node.language && !isDir && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] text-[9px] font-bold uppercase tracking-wider shrink-0">
                            {node.language}
                        </span>
                    )}
                </button>

                {isDir && isExpanded && node.children && (
                    <div className="flex flex-col">
                        {node.children
                            .slice()
                            .sort((a, b) => {
                                if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
                                return a.name.localeCompare(b.name);
                            })
                            .map((child) => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    const hasStructure = !!result.structure;

    return (
        <div className="flex flex-col h-full rounded-2xl border border-[color:var(--border)] bg-[var(--background)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] bg-[var(--card)] px-4 py-3">
                <div className="flex items-center gap-2">
                    <Database size={16} className="text-[var(--primary)]" />
                    <h3 className="text-sm font-bold text-[color:var(--foreground)]">Repository Map</h3>
                </div>
                {hasStructure && (
                    <div className="text-xs text-[color:var(--muted-foreground)] font-mono">
                        {result.structure?.totalDirs} dirs, {result.structure?.totalFiles} files
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {hasStructure && result.structure?.root ? (
                    renderNode(result.structure.root)
                ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                        <Folder className="h-12 w-12 text-[color:var(--border)]" />
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-[color:var(--foreground)]">No Structural Data</h4>
                            <p className="text-xs text-[color:var(--muted-foreground)] max-w-[250px]">
                                The detailed project structure was not included in this analysis result.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
