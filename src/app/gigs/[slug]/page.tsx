import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { artists, gigArtists, gigs } from "@/db/schema";

export const dynamic = "force-dynamic";

function formatDate(date: string | null): string {
  if (!date) return "未定";
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : date;
}

export default async function GigDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [gig] = await db
    .select()
    .from(gigs)
    .where(eq(gigs.slug, slug))
    .limit(1);

  if (!gig) notFound();

  const lineup = await db
    .select({
      artistId: artists.id,
      artistSlug: artists.slug,
      name: artists.name,
      reading: artists.reading,
      tagline: artists.tagline,
      photoUrl: artists.photoUrl,
      genres: artists.genres,
      position: gigArtists.position,
      curatorNote: gigArtists.curatorNote,
    })
    .from(gigArtists)
    .innerJoin(artists, eq(gigArtists.artistId, artists.id))
    .where(eq(gigArtists.gigId, gig.id))
    .orderBy(asc(gigArtists.position));

  return (
    <main className="flex min-h-screen flex-col px-6 pb-12 pt-10">
      <Link
        href="/"
        className="mb-4 self-start text-xs uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-200"
      >
        ← イベント一覧
      </Link>

      {gig.flyerUrl && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <Image
            src={gig.flyerUrl}
            alt={`${gig.title} フライヤー`}
            width={800}
            height={1000}
            className="h-[260px] w-full object-cover"
            unoptimized
          />
        </div>
      )}

      <div className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-rose-300">
        {gig.status !== "published" && (
          <span className="rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-amber-200">
            {gig.status}
          </span>
        )}
        <span>{formatDate(gig.date)}</span>
        {gig.venue && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{gig.venue}</span>
          </>
        )}
      </div>

      <h1 className="text-2xl font-bold text-white">{gig.title || "(無題)"}</h1>
      {gig.intro && (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{gig.intro}</p>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold text-white">出演アーティスト</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            {lineup.length} artists
          </span>
        </div>

        {lineup.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-6 text-center text-xs text-zinc-500">
            出演アーティストはまだ登録されていません。
          </p>
        ) : (
          <ul className="space-y-3">
            {lineup.map((a, i) => (
              <li
                key={a.artistId}
                className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60"
              >
                <div className="flex gap-3 p-3">
                  <div className="relative h-20 w-20 flex-none overflow-hidden rounded-xl bg-zinc-800">
                    {a.photoUrl ? (
                      <Image
                        src={a.photoUrl}
                        alt={`${a.name} アー写`}
                        width={160}
                        height={160}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-zinc-500">
                        no photo
                      </div>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white/80">
                      #{String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-white">
                      {a.name}
                    </h3>
                    {a.reading && (
                      <p className="truncate text-[11px] text-zinc-500">
                        {a.reading}
                      </p>
                    )}
                    {a.tagline && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                        {a.tagline}
                      </p>
                    )}
                    {a.curatorNote && (
                      <p className="mt-2 text-[11px] italic text-rose-300/80">
                        “{a.curatorNote}”
                      </p>
                    )}
                    {a.genres.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.genres.map((g) => (
                          <span
                            key={g}
                            className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
