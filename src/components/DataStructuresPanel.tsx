"use client";

import React from "react";
import {
  X,
  Layers,
  Rows3,
  Grid3x3,
  Link2,
  GitBranch,
  Network,
  type LucideIcon,
} from "lucide-react";
import { DATA_STRUCTURES, type DataStructureDef } from "@/lib/dataStructures";

const ICONS: Record<string, LucideIcon> = {
  Layers,
  Rows3,
  Grid3x3,
  Link2,
  GitBranch,
  Network,
};

interface DataStructuresPanelProps {
  onClose: () => void;
  onInsert: (def: DataStructureDef) => void;
}

export default function DataStructuresPanel({
  onClose,
  onInsert,
}: DataStructuresPanelProps) {
  return (
    <div className="data-structures-panel excalidraw-island">
      <div className="data-structures-panel__header">
        <span className="data-structures-panel__title">Data Structures</span>
        <button
          type="button"
          onClick={onClose}
          className="tool-icon-btn"
          style={{ width: "1.75rem", height: "1.75rem" }}
          title="Close"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <p className="data-structures-panel__hint">
        Drag onto the canvas, or click to insert
      </p>

      <div className="data-structures-panel__list">
        {DATA_STRUCTURES.map((def) => {
          const Icon = ICONS[def.icon] ?? Layers;
          return (
            <div
              key={def.id}
              className="data-structures-panel__card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-data-structure", def.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onInsert(def)}
              title={`Insert ${def.name}`}
            >
              <div className="data-structures-panel__card-icon">
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <div className="data-structures-panel__card-body">
                <span className="data-structures-panel__card-name">
                  {def.name}
                </span>
                <span className="data-structures-panel__card-desc">
                  {def.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
