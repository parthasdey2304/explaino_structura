/**
 * Tab-to-expand support for the code editor:
 *  - HTML: real Emmet abbreviation expansion (`div.card>h2+p` → markup),
 *    via the `emmet` package — the same engine VS Code's HTML support uses.
 *  - Every other supported language: a small IDE-style snippet table
 *    (`syso` → `System.out.println()`, etc — see snippets.ts for why this
 *    isn't literally "Emmet", which has no concept of Java/Python syntax).
 *
 * Both paths are wired through the same Tab key: try the language-specific
 * expansion first, then CodeMirror's own completion acceptance (so an open
 * autocomplete popup still works), and only fall back to a plain tab
 * character when neither applies. This keeps Tab behaving exactly as
 * before for files/languages that don't have snippets.
 */

import { EditorState, Prec, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import {
  acceptCompletion,
  snippetCompletion,
  type CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { insertTab } from "@codemirror/commands";
import { snippetsForLanguage } from "./snippets";
import { getEditorSettings } from "./editorSettings";

// ── Snippet-table languages: a completion source per language ─────────

const WORD_BEFORE_CURSOR = /[A-Za-z_]\w*$/;

function snippetSource(language: string): CompletionSource {
  const defs = snippetsForLanguage(language);
  return (context: CompletionContext) => {
    if (!getEditorSettings().emmetEnabled || defs.length === 0) return null;
    const word = context.matchBefore(WORD_BEFORE_CURSOR);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return {
      from: word.from,
      to: word.to,
      options: defs.map((def) =>
        snippetCompletion(def.template, {
          label: def.trigger,
          detail: def.label,
          type: "keyword",
        })
      ),
      // Keep the same option list while the user keeps typing the trigger.
      validFor: WORD_BEFORE_CURSOR,
    };
  };
}

/**
 * Per-language extension providing the snippet table as language data, so
 * it layers on top of (not instead of) whatever completions the language
 * package itself already registers. `basicSetup`'s single `autocompletion()`
 * call queries every registered source, so nothing else needs to touch the
 * autocompletion config.
 */
export function snippetLanguageData(language: string): Extension {
  const source = snippetSource(language);
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}

// ── HTML: real Emmet expansion, expanded directly on Tab ──────────────

interface EmmetExpansion {
  text: string;
  /** Offset from the start of `text` to place the cursor after insertion. */
  cursorOffset: number;
}

/**
 * Expand an Emmet abbreviation ending at `pos` in `doc`. Returns null when
 * there's nothing abbreviation-shaped right before the cursor.
 */
async function tryExpandEmmet(view: EditorView, pos: number): Promise<{ from: number; to: number; expansion: EmmetExpansion } | null> {
  const line = view.state.doc.lineAt(pos);
  const col = pos - line.from;

  // Dynamically imported: Emmet is only needed for HTML files, so this
  // keeps it out of every other file's bundle chunk.
  const emmet = await import("emmet");

  const extracted = emmet.extract(line.text, col, { type: "markup" });
  if (!extracted) return null;

  let firstFieldOffset = -1;
  let sawField = false;

  let expanded: string;
  try {
    expanded = emmet.default(extracted.abbreviation, {
      options: {
        "output.field": (_index: number, placeholder: string, offset: number) => {
          if (!sawField) {
            sawField = true;
            firstFieldOffset = offset;
          }
          return placeholder ?? "";
        },
      },
    });
  } catch {
    // Not a valid abbreviation (e.g. plain text the user is typing) —
    // let Tab fall through to its normal behavior.
    return null;
  }

  // A one- or two-character "abbreviation" that expanded to itself isn't
  // worth intercepting Tab for (e.g. a bare word with no markup meaning).
  if (!expanded || expanded === extracted.abbreviation) return null;

  return {
    from: line.from + extracted.start,
    to: line.from + extracted.end,
    expansion: {
      text: expanded,
      cursorOffset: firstFieldOffset >= 0 ? firstFieldOffset : expanded.length,
    },
  };
}

async function expandEmmetAtCursor(view: EditorView): Promise<boolean> {
  if (!getEditorSettings().emmetEnabled) return false;
  const { state } = view;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;

  const pos = state.selection.main.head;
  const result = await tryExpandEmmet(view, pos);
  if (!result) return false;

  const { from, to, expansion } = result;
  view.dispatch({
    changes: { from, to, insert: expansion.text },
    selection: { anchor: from + expansion.cursorOffset },
    userEvent: "input.complete",
  });
  return true;
}

// Note: HTML gets no completion-list integration — Emmet abbreviations
// contain punctuation (`.`, `>`, `{`, `}`) that doesn't fit the word-based
// completion model, so expansion is handled entirely by the Tab handler
// above via `expandEmmetAtCursor`, with no language-data extension needed.

// ── The Tab key: language expansion, then completion accept, then a tab ─

/**
 * Static (language-independent) Tab handling, added once to the editor.
 * `activeLanguage` is read fresh on every keypress via a ref-like getter so
 * this doesn't need to be re-registered when the active file changes.
 */
export function createTabKeymap(getActiveLanguage: () => string): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Tab",
        run: (view: EditorView) => {
          // An open completion popup (from the snippet table or the
          // language's own source) takes priority — Tab should accept it.
          if (acceptCompletion(view)) return true;

          if (getActiveLanguage() === "html" && getEditorSettings().emmetEnabled) {
            // Emmet expansion is async (dynamic import), but Tab must
            // return synchronously. Claim the keypress now and, if the
            // text at the cursor wasn't a valid abbreviation, insert a
            // plain tab once we know that.
            expandEmmetAtCursor(view).then((didExpand) => {
              if (!didExpand) insertTab(view);
            });
            return true;
          }

          return insertTab(view);
        },
      },
    ])
  );
}
