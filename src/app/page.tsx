import { cookies } from "next/headers";
import ReadOnlyCanvasView from "@/components/ReadOnlyCanvasView";
import Workspace from "@/components/Workspace";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, cookieStore] = await Promise.all([searchParams, cookies()]);
  const viewId = typeof query.view === "string" ? query.view : undefined;
  if (viewId && query.readonly === "true") {
    return <ReadOnlyCanvasView canvasId={viewId} />;
  }
  return (
    <Workspace
      initialCanvasId={viewId}
      // This is a rendering hint only; AuthGate still checks the session.
      initialCheckingAuth={cookieStore.has("explaino-auth-session")}
    />
  );
}
