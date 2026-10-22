import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch("https://13.49.76.201.sslip.io/healthz", {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.status === "alive") {
        return NextResponse.json({
          status: "online",
          online: true,
          statusCode: res.status,
          lastHeartbeat: data.lastHeartbeat,
        });
      }
    }

    return NextResponse.json(
      {
        status: "offline",
        online: false,
        statusCode: res.status,
        error: `Server returned status ${res.status}`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json(
      {
        status: "offline",
        online: false,
        statusCode: 502,
        error: message,
      },
      { status: 200 }
    );
  }
}
