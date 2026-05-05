import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { gigArtists, gigs } from "@/db/schema";

export const dynamic = "force-dynamic";

type GigRow = {
  id: string;
  slug: string;
  title: string;
  date: string | null;
  venue: string | null;
  intro: string;
  flyerUrl: string | null;
  publishedAt: number | null;
};

async function fetchPublishedGigs(): Promise<
  (GigRow & { artistCount: number })[]
> {
  const rows: GigRow[] = await db
    .select({
      id: gigs.id,
      slug: gigs.slug,
      title: gigs.title,
      date: gigs.date,
      venue: gigs.venue,
      intro: gigs.intro,
      flyerUrl: gigs.flyerUrl,
      publishedAt: gigs.publishedAt,
    })
    .from(gigs)
    .where(eq(gigs.status, "published"))
    .orderBy(desc(gigs.date), desc(gigs.publishedAt));

  if (rows.length === 0) return [];

  const counts = await db
    .select({ gigId: gigArtists.gigId, n: count(gigArtists.artistId) })
    .from(gigArtists)
    .groupBy(gigArtists.gigId);

  const countMap = new Map(counts.map((c) => [c.gigId, Number(c.n)] as const));
  return rows.map((r) => ({ ...r, artistCount: countMap.get(r.id) ?? 0 }));
}

function formatDate(date: string | null): string {
  if (!date) return "未定";
  // YYYY-MM-DD → YYYY.MM.DD で表示。それ以外はそのまま。
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : date;
}

export default async function HomePage() {
  let gigList: Awaited<ReturnType<typeof fetchPublishedGigs>> = [];
  let dbError: string | null = null;
  try {
    gigList = await fetchPublishedGigs();
  } catch (err) {
    dbError = (err as Error).message;
  }

  return (
    <main className="flex min-h-screen flex-col px-6 pb-12 pt-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
              Live Now
            </span>
          </div>
          <h1 className="mt-2 font-mono text-4xl font-bold leading-none tracking-tighter text-white">
            Back<span className="text-rose-500">stage</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            知らないバンドを、待ち時間で好きになる。
          </p>
        </div>
      </header>

      <section className="mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-bold text-white">公開中のイベント</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {gigList.length} events
        </span>
      </section>

      {dbError ? (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <p className="font-semibold">DB エラー</p>
          <p className="mt-1 break-words text-xs">{dbError}</p>
        </div>
      ) : gigList.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm text-zinc-300">まだ公開中のイベントはありません。</p>
          <p className="mt-2 text-xs text-zinc-500">
            管理画面からフライヤーをアップロードして登録できます。
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {gigList.map((g) => (
            <li key={g.id}>
              <Link
                href={`/gigs/${g.slug}`}
                className="group block overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition hover:border-rose-500/60"
              >
                <div className="px-4 py-4">
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-rose-300">
                    <span>{formatDate(g.date)}</span>
                    {g.venue && (
                      <>
                        <span className="text-zinc-600">/</span>
                        <span className="text-zinc-400">{g.venue}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <h3 className="text-lg font-bold text-white">
                      {g.title || "(無題)"}
                    </h3>
                    <span className="mt-1 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-rose-400">
                      →
                    </span>
                  </div>
                  {g.intro && (
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">
                      {g.intro}
                    </p>
                  )}
                  <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    {g.artistCount} artists
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

    </main>
  );
}
