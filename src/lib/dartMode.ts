import { StreamLanguage } from "@codemirror/language";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";

// A lightweight Dart tokenizer for CodeMirror, since @codemirror does not ship
// a dedicated Dart mode.
export const dartLang = StreamLanguage.define(
  simpleMode({
    start: [
      { regex: /\/\/.*/, token: "comment" },
      { regex: /\/\*/, token: "comment", push: "comment" },
      { regex: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\\n]|\\.)*`/, token: "string" },
      { regex: /0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, token: "number" },
      {
        regex: /\b(?:import|export|library|part|show|hide|class|extends|with|implements|mixin|interface|abstract|enum|typedef|void|int|double|num|String|bool|var|final|const|new|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|on|throw|rethrow|this|super|static|async|await|yield|is|as|in|true|false|null|late|required|override|factory|get|set|dynamic|function|assert|defer|sealed|base|final)\b/,
        token: "keyword",
      },
      { regex: /[a-zA-Z_$][\w$]*/, token: "variableName" },
      { regex: /[^\w\s]/, token: "operator" },
    ],
    comment: [
      { regex: /.*?\*\//, token: "comment", next: "start" },
      { regex: /.*/, token: "comment" },
    ],
  })
);
