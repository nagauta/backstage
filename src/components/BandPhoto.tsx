"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  src?: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
};

/**
 * 外部 URL のアー写を表示するコンポーネント。
 * 読み込み失敗時はフォールバック用のグラデを呼び出し側に任せて
 * 自分自身は何も描画しない (= 親の gradient 背景がそのまま見える)。
 */
export function BandPhoto({ src, alt, priority, sizes }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? "(max-width: 480px) 100vw, 430px"}
      className="object-cover"
      priority={priority}
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => {
        if (typeof window !== "undefined") {
          console.warn("[BandPhoto] image load failed:", src);
        }
        setFailed(true);
      }}
    />
  );
}
