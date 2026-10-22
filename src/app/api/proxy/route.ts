import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disallow dangerous internal SSRF destinations
function isDisallowedUrl(targetUrl: URL): boolean {
  const host = targetUrl.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "169.254.169.254"
  ) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  let parsedTarget: URL;
  try {
    let raw = target.trim();
    if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
      raw = "https://" + raw;
    }
    parsedTarget = new URL(raw);
  } catch {
    return new NextResponse("Invalid URL parameter", { status: 400 });
  }

  if (isDisallowedUrl(parsedTarget)) {
    return new NextResponse("Access to internal hosts is restricted", { status: 403 });
  }

  try {
    const upstreamRes = await fetch(parsedTarget.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      },
      redirect: "follow",
    });

    const contentType = upstreamRes.headers.get("content-type") || "";

    // Build response headers — strip all framing and embedding restrictions
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Content-Security-Policy", "frame-ancestors *;");

    // Copy safe headers from upstream
    const blockedHeaders = [
      "x-frame-options",
      "content-security-policy",
      "content-security-policy-report-only",
      "cross-origin-embedder-policy",
      "cross-origin-opener-policy",
      "cross-origin-resource-policy",
      "content-encoding",
      "content-length",
      "transfer-encoding",
    ];

    upstreamRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!blockedHeaders.includes(lower)) {
        responseHeaders.set(key, value);
      }
    });

    // If HTML, inject <base> tag and navigation interception script
    if (contentType.toLowerCase().includes("text/html")) {
      let html = await upstreamRes.text();
      const origin = parsedTarget.origin;
      const fullBaseUrl = parsedTarget.toString();

      // Client injection to enable browser-like navigation inside iframe
      const injectedScript = `
<base href="${origin}/" />
<script>
(function() {
  // Notify parent of current loaded page
  try {
    window.parent.postMessage({ type: 'canvas-browser:navigate', url: ${JSON.stringify(fullBaseUrl)} }, '*');
  } catch (err) {}

  // Intercept standard link clicks and route through the proxy
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a || !a.href) return;
    if (a.href.startsWith('#') || a.href.startsWith('javascript:')) return;
    if (a.getAttribute('target') === '_blank') {
      a.removeAttribute('target');
    }
    e.preventDefault();
    var dest = a.href;
    try {
      window.parent.postMessage({ type: 'canvas-browser:navigate', url: dest }, '*');
    } catch(err) {}
    window.location.href = '/api/proxy?url=' + encodeURIComponent(dest);
  }, true);

  // Intercept form submissions (e.g. Google Search) and route through proxy
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || !form.action) return;
    var method = (form.method || 'GET').toUpperCase();
    if (method === 'GET') {
      e.preventDefault();
      var formData = new FormData(form);
      var params = new URLSearchParams();
      formData.forEach(function(value, key) {
        params.append(key, value);
      });
      var actionUrl = form.action;
      var separator = actionUrl.indexOf('?') !== -1 ? '&' : '?';
      var finalUrl = actionUrl + separator + params.toString();
      try {
        window.parent.postMessage({ type: 'canvas-browser:navigate', url: finalUrl }, '*');
      } catch(err) {}
      window.location.href = '/api/proxy?url=' + encodeURIComponent(finalUrl);
    }
  }, true);
})();
</script>
`;

      if (html.includes("<head>")) {
        html = html.replace("<head>", "<head>" + injectedScript);
      } else if (html.includes("<HEAD>")) {
        html = html.replace("<HEAD>", "<HEAD>" + injectedScript);
      } else {
        html = injectedScript + html;
      }

      responseHeaders.set("Content-Type", "text/html; charset=utf-8");
      return new NextResponse(html, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    // For non-HTML (images, fonts, JSON, stylesheets)
    const arrayBuffer = await upstreamRes.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Proxy request failed";
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:24px;background:#18181b;color:#f4f4f5;">` +
        `<h3>Unable to load page</h3>` +
        `<p style="color:#a1a1aa;">${message}</p>` +
        `<p><a href="${parsedTarget.toString()}" target="_blank" rel="noopener noreferrer" style="color:#818cf8;">Open directly in new tab ↗</a></p>` +
        `</body></html>`,
      {
        status: 502,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}
