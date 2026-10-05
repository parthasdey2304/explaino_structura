"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, Circle, GripVertical, ListTodo, Minus, Plus, Trash2, X } from "lucide-react";

const TODO_STORAGE_KEY = "explaino-todos";

export type TodoStatus = "todo" | "done" | "inprogress";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

function loadTodos(): TodoItem[] {
  try {
    const raw = localStorage.getItem(TODO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is { id: string; text: string; status?: TodoStatus; done?: boolean } =>
          !!item && typeof item.id === "string" && typeof item.text === "string"
      )
      .map((item) => ({
        id: item.id,
        text: item.text,
        status:
          item.status === "done" || item.status === "inprogress" || item.status === "todo"
            ? item.status
            : item.done
              ? "done"
              : "todo",
      }));
  } catch {
    return [];
  }
}

function saveTodos(todos: TodoItem[]): void {
  try {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // storage quota — todo list is best-effort
  }
}

function nextTodoId(): string {
  return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Corner toggle for the todo overlay. Rendered as a floating button docked
 * immediately to the right of Excalidraw's top-left hamburger (main menu)
 * button, mirroring its box, border, icon sizing and gap tokens
 * (see `.todo-corner-dock` / `.todo-corner-btn` in globals.css).
 */
export function TodoCornerButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="todo-corner-dock">
      <button
        type="button"
        onClick={onToggle}
        className={`todo-corner-btn${open ? " todo-corner-btn--open" : ""}`}
        title="Todo list"
        aria-expanded={open}
        aria-label="Todo list"
      >
        <ListTodo size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/**
 * Floating todo panel: type + add, tick to complete (stays in place, struck
 * through and dimmed), delete individual items. Persisted to localStorage.
 */
export default function TodoPanel({ onClose }: { onClose: () => void }) {
  // Lazy init: this panel only ever mounts in the browser (toggled from the
  // toolbar), so localStorage is safe to read during the first render.
  const [todos, setTodos] = useState<TodoItem[]>(() => loadTodos());
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveTodos(todos);
  }, [todos]);

  const addTodo = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: nextTodoId(), text, status: "todo" }]);
    setDraft("");
  }, [draft]);

  const cycleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status:
                t.status === "todo"
                  ? "inprogress"
                  : t.status === "inprogress"
                  ? "done"
                  : "todo",
            }
          : t
      )
    );
  }, []);

  const flipTodos = useCallback(() => {
    setTodos((prev) => [...prev].reverse());
  }, []);

  const dragIndex = useRef<number | null>(null);

  const onDragStart = useCallback((index: number) => {
    dragIndex.current = index;
  }, []);

  const onDrop = useCallback((index: number) => {
    setTodos((prev) => {
      const from = dragIndex.current;
      dragIndex.current = null;
      if (from === null || from === index) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
  }, []);

  const removeTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clicking outside dismisses it. Deferred by one tick so the click that
  // opened the panel doesn't immediately close it again.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const timer = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const remaining = todos.filter((t) => t.status !== "done").length;

  return (
    <div
      className="todo-panel excalidraw-island"
      ref={panelRef}
      role="dialog"
      aria-label="Todo list"
    >
      <div className="todo-panel__header">
        <span className="todo-panel__title">
          <ListTodo size={14} strokeWidth={2.2} />
          Todos
        </span>
        <button
          type="button"
          className="todo-panel__close"
          onClick={flipTodos}
          title="Flip order (top to bottom / bottom to top)"
          aria-label="Flip todo order"
        >
          <ArrowUpDown size={14} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="todo-panel__close"
          onClick={onClose}
          title="Close"
          aria-label="Close todo list"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <form
        className="todo-panel__composer"
        onSubmit={(e) => {
          e.preventDefault();
          addTodo();
        }}
      >
        <input
          className="todo-panel__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a todo…"
          autoFocus
          maxLength={200}
          aria-label="New todo"
        />
        <button
          type="submit"
          className="todo-panel__add"
          disabled={!draft.trim()}
          title="Add todo"
          aria-label="Add todo"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </form>

      <ul className="todo-panel__list">
        {todos.length === 0 && (
          <li className="todo-panel__empty">Nothing here yet — add your first task above.</li>
        )}
        {todos.map((todo, index) => (
          <li
            key={todo.id}
            className={`todo-panel__item${todo.status === "done" ? " todo-panel__item--done" : ""}${todo.status === "inprogress" ? " todo-panel__item--inprogress" : ""}`}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(index)}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={todo.status === "done"}
              className={`todo-panel__check${todo.status === "inprogress" ? " todo-panel__check--inprogress" : ""}`}
              onClick={() => cycleTodo(todo.id)}
              title={
                todo.status === "done"
                  ? "Done — click for not done"
                  : todo.status === "inprogress"
                    ? "On the way — click for not done"
                    : "Not done — click for on the way"
              }
            >
              {todo.status === "done" && <Check size={11} strokeWidth={3} />}
              {todo.status === "inprogress" && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="2" fill="currentColor" />
                  <circle cx="5.5" cy="5.5" r="2" fill="white" />
                </svg>
              )}
            </button>
            <span className="todo-panel__text">{todo.text}</span>
            <button
              type="button"
              className="todo-panel__delete"
              onClick={() => removeTodo(todo.id)}
              title="Delete todo"
              aria-label={`Delete todo: ${todo.text}`}
            >
              <Trash2 size={13} />
            </button>
            <span
              className="todo-panel__drag"
              title="Drag to reorder"
              aria-label="Drag to reorder"
            >
              <GripVertical size={13} />
            </span>
          </li>
        ))}
      </ul>

      {todos.length > 0 && (
        <div className="todo-panel__footer">
          {remaining} of {todos.length} remaining
        </div>
      )}
    </div>
  );
}
