import ReadOnlyCanvasView from "@/components/ReadOnlyCanvasView";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  return <ReadOnlyCanvasView canvasId={canvasId} />;
}
