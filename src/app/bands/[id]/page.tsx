import { notFound } from "next/navigation";
import { BANDS, getBand } from "@/lib/bands";
import BandDetailView from "./BandDetailView";

export function generateStaticParams() {
  return BANDS.map((b) => ({ id: b.id }));
}

export default async function BandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const band = getBand(id);
  if (!band) notFound();
  return <BandDetailView bandId={id} />;
}
