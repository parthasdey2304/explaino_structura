import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PREVIEW_PORT,
  REMOTE_VPS_ORIGIN,
  REMOTE_VPS_TOKEN,
  parsePort,
  isServerOfflineError,
} from "@/lib/vpsProxy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawPort = searchParams.get("port");
  const port = parsePort(rawPort, DEFAULT_PREVIEW_PORT);

  const controller = new AbortController();
  // 8-second timeout for remote VPS round-trips
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const targetUrl = `${REMOTE_VPS_ORIGIN}/proxy/${port}/?token=${REMOTE_VPS_TOKEN}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "*/*",
      },
    });

    clearTimeout(timeoutId);

    const bodyText = await res.text().catch(() => "");
    const isConnRefused = isServerOfflineError(res.status, bodyText);

    // HTTP 200 (OK) or 3xx (Redirect) indicates an active server is listening and responding
    const isOnline = (res.status >= 200 && res.status < 400);

    const statusText = isConnRefused
      ? "ECONNREFUSED"
      : res.statusText || (isOnline ? "OK" : `HTTP ${res.status}`);

    return NextResponse.json({
      port,
      isOnline,
      online: isOnline,
      statusCode: res.status,
      statusText,
      isConnectionRefused: isConnRefused,
      error: !isOnline ? (bodyText.trim() || statusText) : undefined,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : "Connection failed";

    return NextResponse.json(
      {
        port,
        isOnline: false,
        online: false,
        statusCode: 504,
        statusText: "Gateway Timeout",
        isConnectionRefused: false,
        error: message,
      },
      { status: 200 }
    );
  }
}
