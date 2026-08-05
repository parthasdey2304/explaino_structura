import type { ExecutionResult } from "./types";

const TIMEOUT_MS = 5000;

export function executeJavaScript(code: string): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.cssText = "position:fixed;width:0;height:0;visibility:hidden;pointer-events:none;";
    document.body.appendChild(iframe);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const start = performance.now();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener("message", handler);
        iframe.remove();
        resolve({
          stdout,
          stderr: [...stderr, "Execution timed out after 5s"],
          executionTime: TIMEOUT_MS,
          language: "javascript",
          status: "timeout",
        });
      }
    }, TIMEOUT_MS);

    function handler(e: MessageEvent) {
      if (e.source !== iframe.contentWindow) return;
      if (e.data.type === "console") {
        if (e.data.level === "error") stderr.push(e.data.args);
        else stdout.push(e.data.args);
      }
      if (e.data.type === "canvas") {
        const dataURL = e.data.dataURL;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          window.removeEventListener("message", handler);
          iframe.remove();
          resolve({
            stdout,
            stderr,
            canvasDataURL: dataURL,
            executionTime: performance.now() - start,
            language: "javascript",
            status: stderr.length > 0 ? "error" : "success",
          });
        }
      }
      if (e.data.type === "done") {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          window.removeEventListener("message", handler);
          iframe.remove();
          resolve({
            stdout,
            stderr,
            executionTime: performance.now() - start,
            language: "javascript",
            status: stderr.length > 0 ? "error" : "success",
          });
        }
      }
    }

    window.addEventListener("message", handler);

    iframe.srcdoc = `<!DOCTYPE html><html><head><style>body{margin:0;}</style></head><body><canvas id="c"></canvas><script>
(function(){
  var _log=console.log,_err=console.error,_warn=console.warn;
  console.log=function(){var a=Array.from(arguments).join(" ");parent.postMessage({type:"console",level:"log",args:a},"*");};
  console.error=function(){var a=Array.from(arguments).join(" ");parent.postMessage({type:"console",level:"error",args:a},"*");};
  console.warn=console.log;
  window.onerror=function(m,s,l,c,e){console.error(m);return true;};
  try{
    ${code}
  }catch(e){
    console.error(e.message||String(e));
  }
  var cv=document.getElementById("c");
  if(cv&&cv.width>0&&cv.height>0){
    try{parent.postMessage({type:"canvas",dataURL:cv.toDataURL()},"*");}catch(x){}
  }
  parent.postMessage({type:"done"},"*");
})();
<\/script></body></html>`;
  });
}