import BandDetailView from "./BandDetailView";

export const dynamic = "force-dynamic";

export default async function BandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BandDetailView bandId={id} />;
}
