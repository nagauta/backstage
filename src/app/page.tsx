"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { clearBands, saveFlyerDataUrl } from "@/lib/flyerStore";

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);

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

  const onPickDemo = () => {
    clearBands();
    saveFlyerDataUrl("");
    router.push("/analyzing");
  };

  const onReset = () => {
    setPreviewUrl(null);
    setFileMeta(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onRun = () => {
    if (!previewUrl) return;
    clearBands();
    saveFlyerDataUrl(previewUrl);
    router.push("/analyzing");
  };

  return (
    <main className="flex min-h-screen flex-col px-6 pb-10 pt-12">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
          <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">
            Live Now
          </span>
        </div>
      </header>

      <section className="mb-10">
        <h1 className="font-mono text-5xl font-bold leading-none tracking-tighter text-white">
          Back<span className="text-rose-500">stage</span>
        </h1>
        <p className="mt-4 text-lg font-medium leading-snug text-zinc-200">
          知らないバンドを、
          <br />
          待ち時間で好きになる。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          開演前や転換中にライブのフライヤーをかざすだけ。
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

      {previewUrl ? (
        <button
          onClick={onRun}
          className="mt-6 w-full rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(244,63,94,0.45)] transition hover:bg-rose-400 active:scale-[0.99]"
        >
          解析を実行 →
        </button>
      ) : (
        <button
          onClick={onPickDemo}
          className="mt-6 w-full rounded-full border border-zinc-700 bg-zinc-900/60 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-rose-500/60 hover:text-white"
        >
          画像なしでデモを試す →
        </button>
      )}

    </main>
  );
}
