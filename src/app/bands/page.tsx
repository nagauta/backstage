"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { BANDS } from "@/lib/bands";
import { bandsStore } from "@/lib/flyerStore";

export default function BandsPage() {
  const stored = useSyncExternalStore(
    bandsStore.subscribe,
    bandsStore.getSnapshot,
    bandsStore.getServerSnapshot,
  );
  const bands = stored && stored.length > 0 ? stored : BANDS;

  return (
    <main className="flex min-h-screen flex-col px-6 pb-12 pt-10">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
        <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
          {bands.length} bands detected
        </span>
      </div>
      <h1 className="mt-3 text-2xl font-bold text-white">今夜の出演バンド</h1>
      <p className="mt-1 text-sm text-zinc-400">
        気になるバンドをタップして、開演までに予習しよう。
      </p>

      <ul className="mt-6 space-y-3">
        {bands.map((band, i) => (
          <li key={band.id}>
            <Link
              href={`/bands/${band.id}`}
              className="group block overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition hover:border-rose-500/60"
            >
              <div
                className={`relative h-28 overflow-hidden bg-gradient-to-br ${band.hero.gradientFrom} ${band.hero.gradientTo}`}
              >
                {band.photoUrl ? (
                  <Image
                    src={band.photoUrl}
                    alt={`${band.name} アー写`}
                    fill
                    sizes="(max-width: 480px) 100vw, 430px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.18),transparent_60%)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur">
                  #{String(i + 1).padStart(2, "0")}
                </div>
                {band.formedYear > 0 && (
                  <div className="absolute bottom-2 left-3">
                    <span className={`text-[10px] font-mono ${band.hero.accent}`}>
                      EST. {band.formedYear}
                    </span>
                  </div>
                )}
              </div>
              <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {band.name}
                    </h2>
                    {band.reading && (
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {band.reading}
                      </p>
                    )}
                  </div>
                  <span className="mt-1 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-rose-400">
                    →
                  </span>
                </div>
                {band.tagline && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                    {band.tagline}
                  </p>
                )}
                {band.genres.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {band.genres.map((g) => (
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
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/"
        className="mt-8 self-center text-xs uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-200"
      >
        ← 別のフライヤーを読み込む
      </Link>
    </main>
  );
}
