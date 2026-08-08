/**
 * IDE-style snippet tables, keyed by the workspace's language ids.
 *
 * These are deliberately not "Emmet" in the strict sense — Emmet is an
 * HTML/CSS abbreviation engine (see emmetExtension.ts for that), and it has
 * no concept of Java or Python syntax. What every editor actually ships for
 * those languages is a plain trigger-word snippet table: type `sysout`,
 * press Tab, get `System.out.println()`. That's what this file provides,
 * matching the shorthand VS Code's Java/Python extensions use.
 *
 * Templates use CodeMirror's own placeholder syntax (`${name}`, `${1:name}`,
 * `${0}` for the final cursor stop) — see `snippet()` in
 * @codemirror/autocomplete. That engine already handles multi-stop Tab
 * cycling, so no custom cursor-tracking is needed here.
 */

export interface SnippetDef {
  /** Trigger word, typed immediately before the cursor. */
  trigger: string;
  /** Human-readable label shown in the completion popup. */
  label: string;
  /** CodeMirror snippet template (supports ${1:name} / ${0} placeholders). */
  template: string;
}

const JAVASCRIPT_SNIPPETS: SnippetDef[] = [
  { trigger: "cl", label: "console.log()", template: "console.log(${arg});" },
  { trigger: "clg", label: "console.log()", template: "console.log(${arg});" },
  { trigger: "cel", label: "console.error()", template: "console.error(${arg});" },
  { trigger: "fn", label: "function", template: "function ${name}(${params}) {\n\t${}\n}" },
  { trigger: "af", label: "arrow function", template: "(${params}) => {\n\t${}\n}" },
  { trigger: "for", label: "for loop", template: "for (let ${i} = 0; ${i} < ${arr}.length; ${i}++) {\n\t${}\n}" },
  { trigger: "forof", label: "for...of", template: "for (const ${item} of ${iterable}) {\n\t${}\n}" },
  { trigger: "forin", label: "for...in", template: "for (const ${key} in ${object}) {\n\t${}\n}" },
  { trigger: "if", label: "if", template: "if (${condition}) {\n\t${}\n}" },
  { trigger: "ife", label: "if / else", template: "if (${condition}) {\n\t${1}\n} else {\n\t${0}\n}" },
  { trigger: "ternary", label: "ternary", template: "${condition} ? ${1} : ${0}" },
  { trigger: "try", label: "try / catch", template: "try {\n\t${1}\n} catch (${2:err}) {\n\t${0}\n}" },
  { trigger: "class", label: "class", template: "class ${name} {\n\tconstructor(${params}) {\n\t\t${}\n\t}\n}" },
  { trigger: "imp", label: "import", template: "import ${name} from \"${module}\";" },
  { trigger: "exp", label: "export default", template: "export default ${name};" },
  { trigger: "prom", label: "new Promise", template: "new Promise((resolve, reject) => {\n\t${}\n});" },
  { trigger: "settimeout", label: "setTimeout", template: "setTimeout(() => {\n\t${}\n}, ${ms:1000});" },
];

const JAVA_SNIPPETS: SnippetDef[] = [
  { trigger: "syso", label: "System.out.println()", template: "System.out.println(${arg});" },
  { trigger: "sysout", label: "System.out.println()", template: "System.out.println(${arg});" },
  { trigger: "syserr", label: "System.err.println()", template: "System.err.println(${arg});" },
  { trigger: "psvm", label: "public static void main", template: "public static void main(String[] args) {\n\t${}\n}" },
  { trigger: "main", label: "public static void main", template: "public static void main(String[] args) {\n\t${}\n}" },
  { trigger: "fori", label: "for loop", template: "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}" },
  { trigger: "foreach", label: "for...each", template: "for (${Type} ${item} : ${collection}) {\n\t${}\n}" },
  { trigger: "if", label: "if", template: "if (${condition}) {\n\t${}\n}" },
  { trigger: "ife", label: "if / else", template: "if (${condition}) {\n\t${1}\n} else {\n\t${0}\n}" },
  { trigger: "try", label: "try / catch", template: "try {\n\t${1}\n} catch (${2:Exception} ${3:e}) {\n\t${0}\n}" },
  { trigger: "class", label: "class", template: "public class ${name} {\n\t${}\n}" },
  { trigger: "cons", label: "constructor", template: "public ${ClassName}(${params}) {\n\t${}\n}" },
  { trigger: "npe", label: "new instance", template: "${Type} ${name} = new ${Type}(${args});" },
];

const PYTHON_SNIPPETS: SnippetDef[] = [
  { trigger: "pr", label: "print()", template: "print(${arg})" },
  { trigger: "def", label: "function", template: "def ${name}(${params}):\n\t${}" },
  { trigger: "class", label: "class", template: "class ${Name}:\n\tdef __init__(self, ${params}):\n\t\t${}" },
  { trigger: "cls", label: "class", template: "class ${Name}:\n\tdef __init__(self, ${params}):\n\t\t${}" },
  { trigger: "for", label: "for loop", template: "for ${item} in ${iterable}:\n\t${}" },
  { trigger: "forr", label: "for range", template: "for ${i} in range(${n}):\n\t${}" },
  { trigger: "if", label: "if", template: "if ${condition}:\n\t${}" },
  { trigger: "ife", label: "if / else", template: "if ${condition}:\n\t${1}\nelse:\n\t${0}" },
  { trigger: "elif", label: "elif", template: "elif ${condition}:\n\t${}" },
  { trigger: "try", label: "try / except", template: "try:\n\t${1}\nexcept ${2:Exception} as ${3:e}:\n\t${0}" },
  { trigger: "main", label: "if __name__ == \"__main__\"", template: "if __name__ == \"__main__\":\n\t${}" },
  { trigger: "wh", label: "while", template: "while ${condition}:\n\t${}" },
  { trigger: "lc", label: "list comprehension", template: "[${expr} for ${item} in ${iterable}]" },
];

const C_FAMILY_SNIPPETS: SnippetDef[] = [
  { trigger: "printf", label: "printf()", template: "printf(\"${fmt}\\n\"${args});" },
  { trigger: "pf", label: "printf()", template: "printf(\"${fmt}\\n\"${args});" },
  { trigger: "main", label: "int main", template: "int main(${argc}) {\n\t${}\n\treturn 0;\n}" },
  { trigger: "fori", label: "for loop", template: "for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}" },
  { trigger: "if", label: "if", template: "if (${condition}) {\n\t${}\n}" },
  { trigger: "ife", label: "if / else", template: "if (${condition}) {\n\t${1}\n} else {\n\t${0}\n}" },
  { trigger: "inc", label: "#include", template: "#include <${header}>" },
];

const CPP_SNIPPETS: SnippetDef[] = [
  ...C_FAMILY_SNIPPETS,
  { trigger: "cout", label: "std::cout", template: "std::cout << ${arg} << std::endl;" },
  { trigger: "cin", label: "std::cin", template: "std::cin >> ${var};" },
  { trigger: "class", label: "class", template: "class ${Name} {\npublic:\n\t${Name}(${params}) {\n\t\t${}\n\t}\n};" },
  { trigger: "vec", label: "std::vector", template: "std::vector<${Type}> ${name};" },
  { trigger: "foreach", label: "for...each", template: "for (${auto&} ${item} : ${container}) {\n\t${}\n}" },
];

const DART_SNIPPETS: SnippetDef[] = [
  { trigger: "pr", label: "print()", template: "print(${arg});" },
  { trigger: "main", label: "void main", template: "void main() {\n\t${}\n}" },
  { trigger: "fori", label: "for loop", template: "for (var ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}" },
  { trigger: "foreach", label: "for...in", template: "for (var ${item} in ${iterable}) {\n\t${}\n}" },
  { trigger: "if", label: "if", template: "if (${condition}) {\n\t${}\n}" },
  { trigger: "ife", label: "if / else", template: "if (${condition}) {\n\t${1}\n} else {\n\t${0}\n}" },
  { trigger: "class", label: "class", template: "class ${Name} {\n\t${Name}(${params}) {\n\t\t${}\n\t}\n}" },
];

const SNIPPETS_BY_LANGUAGE: Record<string, SnippetDef[]> = {
  javascript: JAVASCRIPT_SNIPPETS,
  java: JAVA_SNIPPETS,
  python: PYTHON_SNIPPETS,
  c: C_FAMILY_SNIPPETS,
  cpp: CPP_SNIPPETS,
  dart: DART_SNIPPETS,
};

export function snippetsForLanguage(language: string): SnippetDef[] {
  return SNIPPETS_BY_LANGUAGE[language] ?? [];
}
