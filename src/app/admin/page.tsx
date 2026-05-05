"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type { Band } from "@/lib/bands";

type VerifyEventInfo = {
  found: boolean;
  title: string;
  date: string;
  venue: string;
  sourceUrl: string;
  lineupConsistent: boolean;
};

type AnalyzeEvent =
  | { type: "phase"; step: string; msg: string }
  | { type: "vision_done"; names: string[] }
  | {
      type: "verify_done";
      verified: string[];
      dropped: { name: string; reason: string }[];
      event: VerifyEventInfo;
    }
  | { type: "band_start"; index: number; name: string }
  | { type: "band_step"; index: number; msg: string }
  | { type: "band_done"; index: number; band: Band }
  | { type: "band_failed"; index: number; name: string; error: string }
  | { type: "done"; bands: Band[]; warnings: string[]; gigSlug: string }
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

type Mode = "upload" | "analyzing";

export default function AdminPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);

  // analysis state
  const [phaseMsg, setPhaseMsg] = useState<string>("接続中…");
  const [rows, setRows] = useState<BandRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setPreviewUrl(dataUrl);
      setFileMeta({ name: file.name, size: file.size });
    };
    reader.readAsDataURL(file);
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onReset = () => {
    setPreviewUrl(null);
    setFileMeta(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onRun = async () => {
    if (!previewUrl) return;
    setMode("analyzing");
    setPhaseMsg("接続中…");
    setRows([]);
    setError(null);
    await runAnalyze(previewUrl);
  };

  const runAnalyze = async (image: string) => {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      if (!res.body) {
        setError("response body is empty");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalSlug: string | null = null;

      while (true) {
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
            case "verify_done":
              setRows(
                event.verified.map((name, i) => ({
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
              finalSlug = event.gigSlug;
              setPhaseMsg("完了!");
              break;
            case "fatal":
              setError(event.error);
              break;
          }
        }
      }

      if (finalSlug) {
        setTimeout(() => router.push(`/gigs/${finalSlug}`), 600);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (mode === "analyzing") {
    return (
      <main className="flex min-h-screen flex-col px-6 pb-12 pt-10">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse-soft rounded-full bg-rose-500" />
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
              Analyzing
            </span>
          </div>
        </header>

        <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="アップロードされたフライヤー"
              width={800}
              height={1000}
              className="h-[260px] w-full object-cover opacity-80"
              unoptimized
            />
          ) : (
            <div className="flex h-[260px] w-full items-center justify-center bg-gradient-to-br from-rose-700/40 via-zinc-900 to-indigo-700/40 text-zinc-500">
              <span className="text-xs">No Image</span>
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
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="font-semibold">エラー:</p>
            <p className="mt-1 break-words text-xs">{error}</p>
            <button
              onClick={() => {
                setMode("upload");
                setError(null);
              }}
              className="mt-3 rounded-full border border-red-400/60 px-3 py-1 text-xs hover:bg-red-500/20"
            >
              ← やり直す
            </button>
          </div>
        )}

        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li
              key={row.index}
              className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
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

  return (
    <main className="flex min-h-screen flex-col px-6 pb-10 pt-12">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
          <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
            Admin
          </span>
        </div>
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-200"
        >
          ← Events
        </Link>
      </header>

      <section className="mb-10">
        <h1 className="font-mono text-5xl font-bold leading-none tracking-tighter text-white">
          Back<span className="text-rose-500">stage</span>
        </h1>
        <p className="mt-4 text-lg font-medium leading-snug text-zinc-200">
          フライヤーから
          <br />
          イベントを生成。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          画像をアップロードして解析を開始すると、draft として保存されます。
        </p>
      </section>

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <Image
            src={previewUrl}
            alt="プレビュー"
            width={800}
            height={1000}
            className="h-[280px] w-full object-cover"
            unoptimized
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-zinc-200">{fileMeta?.name}</p>
              {fileMeta && (
                <p className="text-[10px] text-zinc-400">
                  {(fileMeta.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>
            <button
              onClick={onReset}
              className="flex-none rounded-full bg-black/60 px-3 py-1 text-[11px] text-zinc-200 backdrop-blur-md hover:bg-black/80"
            >
              やり直す
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={`group relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${isDragging
            ? "border-rose-400 bg-rose-500/10"
            : "border-zinc-700 bg-zinc-900/40 hover:border-rose-500/60 hover:bg-zinc-900/60"
            }`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              className="h-6 w-6 text-rose-300"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.5M16 8l-4-4m0 0L8 8m4-4v13"
              />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-white">
              フライヤー画像をアップロード
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              タップしてカメラロールから選択 / ドラッグ&ドロップ
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {previewUrl && (
        <button
          onClick={onRun}
          className="mt-6 w-full rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(244,63,94,0.45)] transition hover:bg-rose-400 active:scale-[0.99]"
        >
          解析を実行 →
        </button>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === "done") {
    return <span className="font-mono text-xs text-emerald-400">DONE</span>;
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
