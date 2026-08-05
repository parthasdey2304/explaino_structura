"use client";

import React, { useMemo, useState } from "react";
import {
  ChevronRight,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import type {
  WorkspaceNode,
  WorkspaceFolder,
} from "@/lib/workspace";
import {
  uid,
  detectLanguage,
  starterFor,
  createNode,
  renameNode,
  deleteNode,
} from "@/lib/workspace";

interface FileExplorerProps {
  tree: WorkspaceNode[];
  activeFileId: string | null;
  onOpenFile: (id: string) => void;
  onTreeChange: (tree: WorkspaceNode[]) => void;
}

type Creating = { parentId: string | null; kind: "file" | "folder" } | null;
type Renaming = { id: string } | null;

export default function FileExplorer({
  tree,
  activeFileId,
  onOpenFile,
  onTreeChange,
}: FileExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState<Creating>(null);
  const [renaming, setRenaming] = useState<Renaming>(null);

  const toggleFolder = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const commitCreate = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && creating) {
      const { parentId, kind } = creating;
      const node: WorkspaceNode =
        kind === "folder"
          ? { type: "folder", id: uid(), name: trimmed, children: [] }
          : {
              type: "file",
              id: uid(),
              name: trimmed,
              language: detectLanguage(trimmed),
              content: starterFor(detectLanguage(trimmed), trimmed),
            };
      onTreeChange(createNode(tree, parentId, node));
      if (kind === "file") {
        // open the newly created file
        onOpenFile(node.id);
      }
      if (kind === "folder") {
        setExpanded((prev) => ({ ...prev, [node.id]: true }));
      }
    }
    setCreating(null);
  };

  const commitRename = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (trimmed) {
      onTreeChange(renameNode(tree, id, trimmed));
    }
    setRenaming(null);
  };

  const handleDelete = (id: string) => {
    onTreeChange(deleteNode(tree, id));
  };

  return (
    <div className="explorer">
      <div className="explorer__header">
        <span className="explorer__title">Explorer</span>
        <div className="explorer__actions">
          <button
            className="explorer__action"
            title="New file"
            onClick={() => setCreating({ parentId: null, kind: "file" })}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="explorer__action"
            title="New folder"
            onClick={() => setCreating({ parentId: null, kind: "folder" })}
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      <div className="explorer__tree">
        {creating?.parentId === null && (
          <InlineInput
            placeholder={
              creating.kind === "folder" ? "Folder name" : "file.js, main.py…"
            }
            onCommit={commitCreate}
            onCancel={() => setCreating(null)}
          />
        )}
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggleFolder}
            activeFileId={activeFileId}
            onOpenFile={onOpenFile}
            creating={creating}
            setCreating={setCreating}
            renaming={renaming}
            setRenaming={setRenaming}
            commitRename={commitRename}
            commitCreate={commitCreate}
            onDelete={handleDelete}
          />
        ))}
        {tree.length === 0 && !creating && (
          <div className="explorer__empty">
            Empty workspace. Create a file to get started.
          </div>
        )}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: WorkspaceNode;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  activeFileId: string | null;
  onOpenFile: (id: string) => void;
  creating: { parentId: string | null; kind: "file" | "folder" } | null;
  setCreating: React.Dispatch<
    React.SetStateAction<{ parentId: string | null; kind: "file" | "folder" } | null>
  >;
  renaming: { id: string } | null;
  setRenaming: React.Dispatch<React.SetStateAction<{ id: string } | null>>;
  commitRename: (id: string, name: string) => void;
  commitCreate: (name: string) => void;
  onDelete: (id: string) => void;
}

function TreeNode(props: TreeNodeProps) {
  const {
    node,
    depth,
    expanded,
    onToggle,
    activeFileId,
    onOpenFile,
    creating,
    setCreating,
    renaming,
    setRenaming,
    commitRename,
    commitCreate,
    onDelete,
  } = props;

  const isFolder = node.type === "folder";
  const isExpanded = isFolder && !!expanded[node.id];
  const isActive = node.id === activeFileId;
  const isRenaming = renaming?.id === node.id;
  const isCreatingHere =
    creating !== null && creating.parentId === node.id && isFolder;

  const childNodes = useMemo(
    () => (isFolder ? (node as WorkspaceFolder).children : null),
    [node, isFolder]
  );

  return (
    <div className="explorer__node">
      <div
        className={`explorer__row${isActive ? " explorer__row--active" : ""}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => {
          if (isFolder) onToggle(node.id);
          else onOpenFile(node.id);
        }}
        onDoubleClick={() => {
          if (isFolder && !isRenaming) setRenaming({ id: node.id });
        }}
      >
        {isFolder ? (
          <>
            <ChevronRight
              size={13}
              className={`explorer__chevron${isExpanded ? " explorer__chevron--open" : ""}`}
            />
            {isExpanded ? (
              <FolderOpen size={14} className="explorer__folder-icon" />
            ) : (
              <Folder size={14} className="explorer__folder-icon" />
            )}
          </>
        ) : (
          <>
            <span className="explorer__chevron-spacer" />
            <FileCode size={14} className="explorer__file-icon" />
          </>
        )}

        {isRenaming ? (
          <InlineInput
            initial={node.name}
            onCommit={(name) => commitRename(node.id, name)}
            onCancel={() => setRenaming(null)}
            stopPropagation
          />
        ) : (
          <span className="explorer__name">{node.name}</span>
        )}

        <span className="explorer__row-actions" onClick={(e) => e.stopPropagation()}>
          {isFolder && (
            <>
              <button
                className="explorer__mini"
                title="New file here"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreating({ parentId: node.id, kind: "file" });
                }}
              >
                <FilePlus size={12} />
              </button>
              <button
                className="explorer__mini"
                title="New folder here"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreating({ parentId: node.id, kind: "folder" });
                }}
              >
                <FolderPlus size={12} />
              </button>
            </>
          )}
          <button
            className="explorer__mini"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              setRenaming({ id: node.id });
            }}
          >
            <Pencil size={12} />
          </button>
          <button
            className="explorer__mini explorer__mini--danger"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        </span>
      </div>

      {isFolder && (
        <div className="explorer__children">
          {isCreatingHere && (
            <InlineInput
              placeholder={creating.kind === "folder" ? "Folder name" : "file.js, main.py…"}
              onCommit={commitCreate}
              onCancel={() => setCreating(null)}
            />
          )}
          {isExpanded && childNodes
            ? childNodes.map((child) => (
                <TreeNode key={child.id} {...props} node={child} depth={depth + 1} />
              ))
            : null}
        </div>
      )}
    </div>
  );
}

// ── Inline input row ──────────────────────────────────────────────────────
function InlineInput({
  initial,
  placeholder,
  onCommit,
  onCancel,
  stopPropagation,
}: {
  initial?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  stopPropagation?: boolean;
}) {
  const [value, setValue] = useState(initial ?? "");

  return (
    <input
      autoFocus
      className="explorer__input"
      style={{ marginLeft: stopPropagation ? 0 : 22, width: "calc(100% - 22px)" }}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(value)}
      onClick={(e) => stopPropagation && e.stopPropagation()}
      onDoubleClick={(e) => stopPropagation && e.stopPropagation()}
      spellCheck={false}
    />
  );
}
