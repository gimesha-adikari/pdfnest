"use client";

import React from "react";
import { FileText, Clock, RotateCcw, Info } from "lucide-react";
import { DocumentInfo, HistoryItem, InspectorTab } from "./types";

interface StudioV2InspectorProps {
  document: DocumentInfo;
  activeTab: InspectorTab;
  history: HistoryItem[];
  onSelectTab: (tab: InspectorTab) => void;
  onCheckoutVersion?: (versionId: string) => void;
}

export const StudioV2Inspector: React.FC<StudioV2InspectorProps> = ({
  document,
  activeTab,
  history,
  onSelectTab,
  onCheckoutVersion,
}) => {
  return (
    <aside className="fixed right-0 top-[48px] bottom-0 w-[300px] bg-[#101216] border-l border-[#292D35] flex flex-col z-40">
      {/* Inspector Tabs */}
      <div className="flex border-b border-[#292D35] bg-[#101216]">
        <button
          onClick={() => onSelectTab("properties")}
          className={`flex-1 py-2.5 text-xs font-mono tracking-wider transition-colors ${
            activeTab === "properties"
              ? "border-b-2 border-[#7c3aed] text-[#d2bbff] bg-[#14171C] font-semibold"
              : "text-[#9AA1AD] hover:text-white border-b-2 border-transparent"
          }`}
        >
          Properties
        </button>
        <button
          onClick={() => onSelectTab("history")}
          className={`flex-1 py-2.5 text-xs font-mono tracking-wider transition-colors ${
            activeTab === "history"
              ? "border-b-2 border-[#7c3aed] text-[#d2bbff] bg-[#14171C] font-semibold"
              : "text-[#9AA1AD] hover:text-white border-b-2 border-transparent"
          }`}
        >
          History
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "properties" ? (
          <div className="p-4 space-y-6">
            {/* Document Properties */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">
                  Document Properties
                </h3>
              </div>

              <div className="space-y-2.5 bg-[#14171C] p-3 rounded border border-[#292D35]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">PAGES</span>
                  <span className="font-medium text-[#F5F7FA]">
                    {document.pageCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">SIZE</span>
                  <span className="font-medium text-[#F5F7FA]">
                    {document.fileSize}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">VERSION</span>
                  <span className="font-medium text-[#F5F7FA]">
                    {document.version}
                  </span>
                </div>
              </div>
            </div>

            {/* Page Geometry */}
            <div>
              <h3 className="text-xs font-semibold text-[#F5F7FA] mb-3">
                Page Dimensions
              </h3>
              <div className="space-y-2.5 bg-[#14171C] p-3 rounded border border-[#292D35]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">WIDTH</span>
                  <span className="font-medium text-[#F5F7FA]">595.28 pt</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">HEIGHT</span>
                  <span className="font-medium text-[#F5F7FA]">841.89 pt</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">ROTATION</span>
                  <span className="font-medium text-[#F5F7FA]">0°</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">
                  Editing History
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#9AA1AD]">
                DAG LINEAGE
              </span>
            </div>

            {/* Explicit Notice of Shell Placeholder */}
            <div className="mb-4 p-2 bg-[#14171C] rounded border border-[#292D35] flex items-start gap-2 text-[10px] text-[#9AA1AD]">
              <Info className="w-3.5 h-3.5 text-[#d2bbff] shrink-0 mt-0.5" />
              <span>
                Visual shell timeline. Live backend lineage & checkout connect in Phase 3B.
              </span>
            </div>

            {/* Timeline */}
            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[#292D35]">
              {history.map((item) => (
                <div key={item.id} className="relative group">
                  {/* Timeline Bullet Node */}
                  <div
                    className={`absolute -left-6 top-1 w-4 h-4 rounded-full border flex items-center justify-center bg-[#101216] transition-colors ${
                      item.isActive
                        ? "border-[#7c3aed]"
                        : "border-[#292D35] group-hover:border-[#9AA1AD]"
                    }`}
                  >
                    {item.isActive && (
                      <div className="w-2 h-2 rounded-full bg-[#7c3aed]" />
                    )}
                  </div>

                  <div
                    className={`p-2.5 rounded text-xs transition-colors border ${
                      item.isActive
                        ? "bg-[#181B21] border-[#7c3aed] text-white"
                        : "bg-[#14171C] border-[#292D35] text-[#9AA1AD] hover:text-[#F5F7FA] hover:border-[#3b3742]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.action}</span>
                      {onCheckoutVersion && !item.isActive && (
                        <button
                          onClick={() => onCheckoutVersion(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-[#d2bbff] transition-opacity"
                          title="Restore this version (Phase 3B)"
                          aria-label={`Restore version ${item.versionNumber}`}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[#717784] block mt-1">
                      v{item.versionNumber} • {item.timestamp}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
