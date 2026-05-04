"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BANDS, type Band } from "@/lib/bands";
import {
  bandsStore,
  clearFlyerDataUrl,
  flyerStore,
  loadFlyerDataUrl,
  saveBands,
} from "@/lib/flyerStore";

const STEPS = [
  "フライヤーを解析中…",
  "出演バンドを抽出中…",
  "ディープリサーチ実行中…",
  "プロフィールを編集中…",
];

type ApiOk = { ok: true; bands: Band[]; warnings?: string[] };
type ApiErr = { ok: false; error: string };

export default function AnalyzingPage() {
  const router = useRouter();
  const flyer = useSyncExternalStore(
    flyerStore.subscribe,
    flyerStore.getSnapshot,
    flyerStore.getServerSnapshot,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [detected, setDetected] = useState<Band[]>([]);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length);
    }, 1100);
    return () => clearInterval(stepTimer);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // 既に解析済みの結果があれば再実行せず /bands へ
    const existing = bandsStore.getSnapshot();
    if (existing && existing.length > 0) {
      router.replace("/bands");
      return;
    }

    const flyerData = loadFlyerDataUrl();

    // Demo mode: 画像なしの場合は静的データで動作確認
    if (!flyerData) {
      const total = BANDS.length;
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let i = 1; i <= total; i++) {
        timers.push(
          setTimeout(() => setDetected(BANDS.slice(0, i)), 600 + i * 700),
        );
      }
      const finish = setTimeout(
        () => {
          saveBands(BANDS);
          router.push("/bands");
        },
        600 + (total + 1) * 700,
      );
      return () => {
        timers.forEach(clearTimeout);
        clearTimeout(finish);
      };
    }

    // 実モード: /api/analyze を呼ぶ
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: flyerData }),
          signal: controller.signal,
        });
        const data = (await res.json()) as ApiOk | ApiErr;
        if (!data.ok) {
          setError(data.error);
          return;
        }
        setDetected(data.bands);
        saveBands(data.bands);
        // 同じ画像で再実行されないように flyer をクリア
        clearFlyerDataUrl();
        // 演出として一拍置く
        setTimeout(() => router.push("/bands"), 800);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      }
    })();

    return () => controller.abort();
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col px-6 pb-12 pt-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 animate-pulse-soft rounded-full bg-rose-500" />
        <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
          Analyzing
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        {flyer ? (
          <Image
            src={flyer}
            alt="アップロードされたフライヤー"
            width={800}
            height={1000}
            className="h-[260px] w-full object-cover opacity-80"
            unoptimized
          />
        ) : (
          <div className="flex h-[260px] w-full items-center justify-center bg-gradient-to-br from-rose-700/40 via-zinc-900 to-indigo-700/40 text-zinc-500">
            <span className="text-xs">No Image (Demo Mode)</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-px animate-pulse bg-gradient-to-r from-transparent via-rose-400 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-px animate-pulse bg-gradient-to-r from-transparent via-rose-400 to-transparent" />
          <div className="scanline absolute inset-x-0 h-12 -translate-y-12 bg-gradient-to-b from-transparent via-rose-500/15 to-transparent" />
        </div>
      </div>

      <div className="mt-8">
        <p className="font-mono text-sm text-rose-400">
          {error ? "解析に失敗しました" : STEPS[stepIndex]}
        </p>
        {flyer ? (
          <p className="mt-2 text-xs text-zinc-500">
            実際にバンドを Web 検索しています。30 秒〜数分かかることがあります。
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            ※ デモモード(画像なし)。固定のサンプルバンドを表示します。
          </p>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <p className="font-semibold">エラー:</p>
          <p className="mt-1 break-words text-xs">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-3 rounded-full border border-red-400/60 px-3 py-1 text-xs hover:bg-red-500/20"
          >
            ホームに戻る
          </button>
        </div>
      )}

      <ul className="mt-8 space-y-3">
        {detected.map((band) => (
          <li
            key={band.id}
            className="animate-fade-up flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
          >
            <span className="font-mono text-xs text-emerald-400">DETECTED</span>
            <span className="text-sm font-semibold text-white">{band.name}</span>
            {band.genres[0] && (
              <span className="ml-auto text-[10px] uppercase tracking-widest text-zinc-500">
                {band.genres[0]}
              </span>
            )}
          </li>
        ))}
        {!error && detected.length === 0 && (
          <li className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-transparent px-4 py-3 text-zinc-500">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-rose-400" />
            <span className="text-sm">searching…</span>
          </li>
        )}
      </ul>

      <style jsx>{`
        .scanline {
          animation: scan 2.4s linear infinite;
        }
        @keyframes scan {
          0% {
            transform: translateY(-3rem);
          }
          100% {
            transform: translateY(260px);
          }
        }
      `}</style>
    </main>
  );
}
