"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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

type AnalyzeEvent =
  | { type: "phase"; step: string; msg: string }
  | { type: "vision_done"; names: string[] }
  | { type: "band_start"; index: number; name: string }
  | { type: "band_step"; index: number; msg: string }
  | { type: "band_done"; index: number; band: Band }
  | { type: "band_failed"; index: number; name: string; error: string }
  | { type: "done"; bands: Band[]; warnings: string[] }
  | { type: "fatal"; error: string };

type RowStatus = "pending" | "running" | "done" | "failed";
type BandRow = {
  index: number;
  name: string;
  status: RowStatus;
  step?: string;
  band?: Band;
  error?: string;
};

export default function AnalyzingPage() {
  const router = useRouter();
  const flyer = useSyncExternalStore(
    flyerStore.subscribe,
    flyerStore.getSnapshot,
    flyerStore.getServerSnapshot,
  );
  const [phaseMsg, setPhaseMsg] = useState<string>("接続中…");
  const [rows, setRows] = useState<BandRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 既に解析済みの結果があれば再実行せず /bands へ
    const existing = bandsStore.getSnapshot();
    if (existing && existing.length > 0) {
      router.replace("/bands");
      return;
    }

    const flyerData = loadFlyerDataUrl();
    let cancelled = false;

    // Demo mode: 画像なしの場合は静的データで動作確認
    if (!flyerData) {
      const total = BANDS.length;
      const initTimer = setTimeout(() => {
        if (cancelled) return;
        setPhaseMsg("デモモード: サンプルバンドを表示中…");
        setRows(
          BANDS.map((b, i) => ({ index: i, name: b.name, status: "pending" })),
        );
      }, 0);
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let i = 0; i < total; i++) {
        timers.push(
          setTimeout(
            () => {
              if (cancelled) return;
              setRows((rs) =>
                rs.map((r) =>
                  r.index === i ? { ...r, status: "done", band: BANDS[i] } : r,
                ),
              );
            },
            600 + (i + 1) * 700,
          ),
        );
      }
      const finish = setTimeout(
        () => {
          if (cancelled) return;
          saveBands(BANDS);
          router.push("/bands");
        },
        600 + (total + 1) * 700,
      );
      return () => {
        cancelled = true;
        clearTimeout(initTimer);
        timers.forEach(clearTimeout);
        clearTimeout(finish);
      };
    }

    // 実モード: SSE で /api/analyze から進捗を受け取る
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: flyerData }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (!cancelled) setError(data?.error ?? `HTTP ${res.status}`);
          return;
        }

        if (!res.body) {
          if (!cancelled) setError("response body is empty");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let finalBands: Band[] | null = null;

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const data = chunk
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).replace(/^\s/, ""))
              .join("\n");
            if (!data) continue;
            let event: AnalyzeEvent;
            try {
              event = JSON.parse(data) as AnalyzeEvent;
            } catch (e) {
              console.warn("failed to parse SSE event", data, e);
              continue;
            }
            if (cancelled) break;
            switch (event.type) {
              case "phase":
                setPhaseMsg(event.msg);
                break;
              case "vision_done":
                setRows(
                  event.names.map((name, i) => ({
                    index: i,
                    name,
                    status: "pending",
                  })),
                );
                break;
              case "band_start":
                setRows((rs) =>
                  rs.map((r) =>
                    r.index === event.index
                      ? { ...r, status: "running", step: "開始" }
                      : r,
                  ),
                );
                break;
              case "band_step":
                setRows((rs) =>
                  rs.map((r) =>
                    r.index === event.index ? { ...r, step: event.msg } : r,
                  ),
                );
                break;
              case "band_done":
                setRows((rs) =>
                  rs.map((r) =>
                    r.index === event.index
                      ? {
                          ...r,
                          status: "done",
                          step: undefined,
                          band: event.band,
                        }
                      : r,
                  ),
                );
                break;
              case "band_failed":
                setRows((rs) =>
                  rs.map((r) =>
                    r.index === event.index
                      ? {
                          ...r,
                          status: "failed",
                          step: undefined,
                          error: event.error,
                        }
                      : r,
                  ),
                );
                break;
              case "done":
                finalBands = event.bands;
                setPhaseMsg("完了!");
                break;
              case "fatal":
                setError(event.error);
                break;
            }
          }
        }

        if (cancelled) return;

        if (finalBands && finalBands.length > 0) {
          saveBands(finalBands);
          clearFlyerDataUrl();
          setTimeout(() => {
            if (!cancelled) router.push("/bands");
          }, 600);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (cancelled) return;
        setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
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
          {error ? "解析に失敗しました" : phaseMsg}
        </p>
        {!flyer && !error && (
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
        {rows.map((row) => (
          <li
            key={row.index}
            className="animate-fade-up flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
          >
            <StatusBadge status={row.status} />
            <span
              className={`text-sm font-semibold ${row.status === "failed" ? "text-zinc-400 line-through" : "text-white"}`}
            >
              {row.name}
            </span>
            <span className="ml-auto truncate text-[11px] text-zinc-500">
              {row.status === "running" && (row.step ?? "処理中…")}
              {row.status === "done" && (row.band?.genres[0] ?? "done")}
              {row.status === "failed" && "失敗"}
              {row.status === "pending" && "待機中"}
            </span>
          </li>
        ))}
        {rows.length === 0 && !error && (
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

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === "done") {
    return (
      <span className="font-mono text-xs text-emerald-400">DONE</span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-rose-300">
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-rose-300/30 border-t-rose-300" />
        RUN
      </span>
    );
  }
  if (status === "failed") {
    return <span className="font-mono text-xs text-red-400">FAIL</span>;
  }
  return <span className="font-mono text-xs text-zinc-500">···</span>;
}
