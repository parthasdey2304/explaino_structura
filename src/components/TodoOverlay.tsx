"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, ListTodo, Plus, Trash2, X } from "lucide-react";

const TODO_STORAGE_KEY = "explaino-todos";

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

function loadTodos(): TodoItem[] {
  try {
    const raw = localStorage.getItem(TODO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TodoItem =>
        !!item && typeof item.id === "string" && typeof item.text === "string"
    );
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
 * Toolbar toggle for the todo overlay. Rendered inside Excalidraw's top-right
 * button row, immediately after the existing utility buttons.
 */
export function TodoToolbarButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`excalidraw-button${open ? " excalidraw-button--primary" : ""}`}
      style={{
        height: "2rem",
        padding: "0 0.6rem",
        minWidth: "2.6rem",
        fontSize: "0.8rem",
        borderRadius: "0.5rem",
        background: open ? undefined : "var(--color-surface-primary-container, #e0dfff)",
        color: open ? undefined : "var(--color-on-primary-container, #030064)",
        border: "none",
        cursor: "pointer",
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title="Todo list"
      aria-expanded={open}
      aria-label="Todo list"
    >
      <ListTodo size={16} strokeWidth={2.2} />
    </button>
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
    setTodos((prev) => [...prev, { id: nextTodoId(), text, done: false }]);
    setDraft("");
  }, [draft]);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
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

  const remaining = todos.filter((t) => !t.done).length;

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
        {todos.map((todo) => (
          <li
            key={todo.id}
            className={`todo-panel__item${todo.done ? " todo-panel__item--done" : ""}`}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={todo.done}
              className="todo-panel__check"
              onClick={() => toggleTodo(todo.id)}
              title={todo.done ? "Mark as not done" : "Mark as done"}
            >
              {todo.done && <Check size={11} strokeWidth={3} />}
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
