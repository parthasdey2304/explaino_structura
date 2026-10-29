import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const controller = new AbortController();
  // 8-second timeout for international round-trips & TLS handshakes
  const timeoutId = setTimeout(() => controller.abort(), 8000);

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
      // Code-server returns {"status":"alive"} when actively receiving input,
      // and {"status":"expired"} when idle. In both states, code-server is
      // alive, healthy, and ready to serve requests.
      const isOnline =
        res.status === 200 &&
        (data?.status === "alive" || data?.status === "expired" || Boolean(data?.lastHeartbeat));

      if (isOnline) {
        return NextResponse.json({
          status: "online",
          online: true,
          statusCode: res.status,
          healthStatus: data?.status || "alive",
          lastHeartbeat: data?.lastHeartbeat,
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
        statusCode: 504,
        error: message,
      },
      { status: 200 }
    );
  }
}
