"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BANDS } from "@/lib/bands";
import { bandsStore } from "@/lib/flyerStore";
import { BandPhoto } from "@/components/BandPhoto";

type Props = { bandId: string };

export default function BandDetailView({ bandId }: Props) {
  const router = useRouter();
  const stored = useSyncExternalStore(
    bandsStore.subscribe,
    bandsStore.getSnapshot,
    bandsStore.getServerSnapshot,
  );
  const bands = stored && stored.length > 0 ? stored : BANDS;

  const band = useMemo(
    () => bands.find((b) => b.id === bandId),
    [bands, bandId],
  );
  const idx = useMemo(
    () => bands.findIndex((b) => b.id === bandId),
    [bands, bandId],
  );

  const prevBand = idx > 0 ? bands[idx - 1] : null;
  const nextBand =
    idx >= 0 && idx < bands.length - 1 ? bands[idx + 1] : null;

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [bandId]);

  if (!band) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-zinc-300">
        <p className="text-sm">バンドが見つかりませんでした。</p>
        <Link
          href="/bands"
          className="rounded-full border border-zinc-700 px-4 py-2 text-xs hover:border-rose-500/60"
        >
          ← 一覧へ戻る
        </Link>
      </main>
    );
  }

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    setDragX(dx);
  };
  const onTouchEnd = () => {
    if (startX.current == null) return;
    const threshold = 80;
    if (dragX < -threshold && nextBand) {
      router.push(`/bands/${nextBand.id}`);
    } else if (dragX > threshold && prevBand) {
      router.push(`/bands/${prevBand.id}`);
    }
    startX.current = null;
    setDragX(0);
    setIsDragging(false);
  };

  return (
    <main
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="flex min-h-screen flex-col pb-24"
      style={{
        transform: `translateX(${Math.max(Math.min(dragX, 60), -60)}px)`,
        transition: isDragging ? "none" : "transform 0.2s ease-out",
      }}
    >
      {/* Hero */}
      <header
        className={`relative h-[320px] w-full overflow-hidden bg-gradient-to-br ${band.hero.gradientFrom} ${band.hero.gradientTo}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,rgba(255,255,255,0.25),transparent_55%)]" />
        <BandPhoto src={band.photoUrl} alt={`${band.name} アー写`} priority />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/85" />

        <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-5 pt-5">
          <Link
            href="/bands"
            className="rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur-md hover:bg-black/60"
          >
            ← 一覧
          </Link>
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/70">
            {String(idx + 1).padStart(2, "0")} /{" "}
            {String(bands.length).padStart(2, "0")}
          </div>
        </div>

        <div className="absolute bottom-5 left-5 right-5">
          {band.genres.length > 0 && (
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.3em] ${band.hero.accent}`}
            >
              {band.genres.join(" / ")}
            </span>
          )}
          <h1 className="mt-2 text-3xl font-bold leading-tight text-white">
            {band.name}
          </h1>
          {band.reading && (
            <p className="mt-1 text-xs text-white/70">{band.reading}</p>
          )}
        </div>
      </header>

      {/* Tagline */}
      {band.tagline && (
        <section className="px-6 pb-6 pt-6">
          <p className="text-base font-medium leading-relaxed text-zinc-100">
            {band.tagline}
          </p>
        </section>
      )}

      {/* Profile */}
      <section className="px-6">
        <SectionTitle eyebrow="Profile" title="プロフィール" />
        <dl className="mt-3 divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/40 text-sm">
          <Row
            label="結成"
            value={band.formedYear > 0 ? `${band.formedYear}年` : "不明"}
          />
          <Row label="拠点" value={band.origin || "不明"} />
          <Row
            label="メンバー"
            value={band.members.length > 0 ? band.members.join(" / ") : "不明"}
            multiline
          />
        </dl>
      </section>

      {/* Bio */}
      {band.bio && (
        <section className="mt-8 px-6">
          <SectionTitle eyebrow="Story" title="バンド概要" />
          <p className="mt-3 text-sm leading-7 text-zinc-300">{band.bio}</p>
        </section>
      )}

      {/* Interview */}
      <section className="mt-10 px-6">
        <SectionTitle eyebrow="Interview" title="バンドに訊く" />
        {band.interview.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-xs text-zinc-500">
            該当インタビューが見つかりませんでした。
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {band.interview.map((qa, i) => (
              <article key={i}>
                <div className="flex gap-3">
                  <span className={`font-mono text-xl ${band.hero.accent}`}>
                    Q{i + 1}.
                  </span>
                  <h3 className="text-base font-bold text-white">{qa.q}</h3>
                </div>
                <p className="mt-2 pl-9 text-sm leading-7 text-zinc-300">
                  {qa.a}
                </p>
                {qa.source && (
                  <p className="mt-2 pl-9 text-[10px] text-zinc-500">
                    出典:{" "}
                    <a
                      href={qa.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-rose-400/80 underline-offset-2 hover:underline"
                    >
                      {qa.source}
                    </a>
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Tracks */}
      {band.tracks.length > 0 && (
        <section className="mt-10 px-6">
          <SectionTitle eyebrow="Pick 3" title="おすすめ曲3選" />
          <ol className="mt-4 space-y-3">
            {band.tracks.map((t, i) => (
              <li
                key={`${t.title}-${i}`}
                className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-zinc-800 font-mono text-sm text-zinc-300">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white">{t.title}</h4>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {[t.album, t.year > 0 ? t.year : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {t.description && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      {t.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Links */}
      {band.links.length > 0 && (
        <section className="mt-10 px-6">
          <SectionTitle eyebrow="Links" title="関連リンク" />
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {band.links.map((l) => (
              <li key={`${l.label}-${l.url}`}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3 text-center text-xs text-zinc-200 transition hover:border-rose-500/60 hover:text-white"
                >
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Swipe hint / nav */}
      {bands.length > 1 && (
        <nav className="mt-12 px-6">
          <div className="flex items-center justify-between gap-3">
            {prevBand ? (
              <Link
                href={`/bands/${prevBand.id}`}
                className="flex flex-1 flex-col items-start rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 hover:border-rose-500/60"
              >
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                  ← Prev
                </span>
                <span className="mt-1 text-sm text-white line-clamp-1">
                  {prevBand.name}
                </span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
            {nextBand ? (
              <Link
                href={`/bands/${nextBand.id}`}
                className="flex flex-1 flex-col items-end rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 hover:border-rose-500/60"
              >
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Next →
                </span>
                <span className="mt-1 text-sm text-white line-clamp-1">
                  {nextBand.name}
                </span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
          </div>
          <p className="mt-4 text-center text-[10px] uppercase tracking-[0.3em] text-zinc-600">
            ← swipe to switch bands →
          </p>
        </nav>
      )}
    </main>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-rose-400">
        {eyebrow}
      </span>
      <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div
      className={`flex gap-3 px-4 py-3 ${multiline ? "flex-col" : "items-center justify-between"}`}
    >
      <dt className="text-[11px] uppercase tracking-widest text-zinc-500">
        {label}
      </dt>
      <dd className="text-sm text-zinc-100">{value}</dd>
    </div>
  );
}
