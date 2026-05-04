import OpenAI from "openai";
import type { Band, QA, Track, RelatedLink } from "@/lib/bands";

export const runtime = "nodejs";
export const maxDuration = 300;

const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
const RESEARCH_MODEL = process.env.OPENAI_RESEARCH_MODEL ?? "gpt-4o";
const SEARCH_CONTEXT_SIZE =
  (process.env.OPENAI_SEARCH_CONTEXT_SIZE as "low" | "medium" | "high" | undefined) ?? "low";
const MAX_BANDS = Number(process.env.OPENAI_MAX_BANDS ?? "8");

type AnalyzeRequest = { image?: string };
type AnalyzeError = { ok: false; error: string };

export type AnalyzeEvent =
  | { type: "phase"; step: string; msg: string }
  | { type: "vision_done"; names: string[] }
  | { type: "band_start"; index: number; name: string }
  | { type: "band_step"; index: number; msg: string }
  | { type: "band_done"; index: number; band: Band }
  | { type: "band_failed"; index: number; name: string; error: string }
  | { type: "done"; bands: Band[]; warnings: string[] }
  | { type: "fatal"; error: string };

const HERO_PALETTES = [
  { gradientFrom: "from-indigo-900", gradientTo: "to-fuchsia-700", accent: "text-fuchsia-300" },
  { gradientFrom: "from-emerald-900", gradientTo: "to-amber-700", accent: "text-amber-300" },
  { gradientFrom: "from-pink-700", gradientTo: "to-cyan-600", accent: "text-cyan-300" },
  { gradientFrom: "from-zinc-800", gradientTo: "to-red-700", accent: "text-red-400" },
  { gradientFrom: "from-sky-900", gradientTo: "to-violet-700", accent: "text-violet-300" },
];

const BAND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "reading",
    "formedYear",
    "origin",
    "members",
    "genres",
    "tagline",
    "photoUrl",
    "bio",
    "interview",
    "tracks",
    "links",
  ],
  properties: {
    name: { type: "string" },
    reading: { type: "string" },
    formedYear: { type: "integer" },
    origin: { type: "string" },
    members: { type: "array", items: { type: "string" } },
    genres: { type: "array", items: { type: "string" } },
    tagline: { type: "string" },
    photoUrl: { type: "string" },
    bio: { type: "string" },
    interview: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "a", "source"],
        properties: {
          q: { type: "string" },
          a: { type: "string" },
          source: { type: "string" },
        },
      },
    },
    tracks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "album", "year", "description"],
        properties: {
          title: { type: "string" },
          album: { type: "string" },
          year: { type: "integer" },
          description: { type: "string" },
        },
      },
    },
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "url"],
        properties: {
          label: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
} as const;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `band-${Math.random().toString(36).slice(2, 8)}`
  );
}

function newReqId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function log(rid: string, label: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(`[analyze:${rid}] ${label}`);
    return;
  }
  let body: string;
  try {
    body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  } catch {
    body = String(payload);
  }
  console.log(`[analyze:${rid}] ${label}\n${body}`);
}

function errorJson(status: number, error: string) {
  return Response.json({ ok: false, error } satisfies AnalyzeError, { status });
}

export async function POST(req: Request): Promise<Response> {
  const rid = newReqId();
  const tStart = Date.now();
  log(rid, "▶ request received");

  if (!process.env.OPENAI_API_KEY) {
    log(rid, "✖ missing OPENAI_API_KEY");
    return errorJson(500, "OPENAI_API_KEY is not set on the server.");
  }

  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return errorJson(400, "Invalid JSON body.");
  }

  const image = body.image?.trim();
  if (!image || !image.startsWith("data:image/")) {
    return errorJson(400, "image (data URL) is required.");
  }
  log(rid, `image received (${image.length} chars)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalyzeEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const client = new OpenAI();
      const warnings: string[] = [];

      try {
        // === Phase 1: vision ===
        send({ type: "phase", step: "vision", msg: "フライヤーを解析中…" });
        const t1 = Date.now();
        const names = await extractBandNames(client, image, rid);
        log(rid, `① vision done in ${Date.now() - t1}ms`, { names });
        send({ type: "vision_done", names });

        if (names.length === 0) {
          send({ type: "fatal", error: "No band names detected in the flyer." });
          controller.close();
          return;
        }

        const targets = names.slice(0, MAX_BANDS);
        if (names.length > MAX_BANDS) {
          warnings.push(
            `${names.length} bands detected; capped at ${MAX_BANDS}. Adjust OPENAI_MAX_BANDS to change.`,
          );
        }

        // === Phase 2: research bands in parallel ===
        send({
          type: "phase",
          step: "research",
          msg: `${targets.length}バンドのディープリサーチを並列実行中…`,
        });
        log(rid, `② research+format start (${targets.length} bands in parallel)`, {
          targets,
        });
        const t2 = Date.now();

        const slots: (Band | undefined)[] = new Array(targets.length).fill(undefined);

        await Promise.all(
          targets.map(async (name, i) => {
            send({ type: "band_start", index: i, name });
            try {
              send({ type: "band_step", index: i, msg: "Web を検索中…" });
              const formatted = await researchAndFormat(client, name, `${rid}#${i}`);
              send({ type: "band_step", index: i, msg: "アー写を検証中…" });
              const band = await composeBand(formatted, name, i, rid);
              slots[i] = band;
              send({ type: "band_done", index: i, band });
            } catch (err) {
              const msg = (err as Error).message;
              log(rid, `✖ research failed for "${name}"`, { message: msg });
              warnings.push(`research failed for "${name}": ${msg}`);
              send({ type: "band_failed", index: i, name, error: msg });
            }
          }),
        );

        log(rid, `② research+format done in ${Date.now() - t2}ms`);

        const bands = slots.filter((b): b is Band => Boolean(b));

        if (bands.length === 0) {
          send({
            type: "fatal",
            error: `research failed for all ${targets.length} bands. ${warnings.join(" / ")}`,
          });
          controller.close();
          return;
        }

        log(rid, `✓ done in ${Date.now() - tStart}ms`, {
          bandCount: bands.length,
          bandNames: bands.map((b) => b.name),
        });

        send({ type: "done", bands, warnings });
      } catch (err) {
        log(rid, "✖ pipeline error", { message: (err as Error).message });
        send({ type: "fatal", error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function extractBandNames(
  client: OpenAI,
  dataUrl: string,
  rid: string,
): Promise<string[]> {
  const systemPrompt =
    "You are an expert at reading Japanese live-show / concert flyers. Extract every performing band/artist name printed on the image. Ignore venue names, organizer names, dates, sponsor logos, and ticket info. Return names exactly as printed (preserve original script). De-duplicate trivially-equivalent names.";
  const userPrompt = "Extract the bands/artists performing on this flyer.";

  log(rid, "→ vision request", {
    model: VISION_MODEL,
    system: systemPrompt,
    user: userPrompt,
  });

  const completion = await client.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "BandLineup",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["bands"],
          properties: {
            bands: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name"],
                properties: { name: { type: "string" } },
              },
            },
          },
        },
      },
    },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  log(rid, "← vision raw response", raw);
  const parsed = JSON.parse(raw) as { bands: { name: string }[] };
  return parsed.bands.map((b) => b.name).filter((n) => n.trim().length > 0);
}

type FormattedBand = {
  name: string;
  reading: string;
  formedYear: number;
  origin: string;
  members: string[];
  genres: string[];
  tagline: string;
  photoUrl: string;
  bio: string;
  interview: { q: string; a: string; source: string }[];
  tracks: { title: string; album: string; year: number; description: string }[];
  links: { label: string; url: string }[];
};

async function researchAndFormat(
  client: OpenAI,
  bandName: string,
  rid: string,
): Promise<FormattedBand> {
  const prompt = [
    `バンド/アーティスト名: ${bandName}`,
    "",
    "上記のバンドについて、Web を実際に検索 (web_search ツール) して一次情報ベースで調べ、JSON スキーマに従って返してください。",
    "",
    "- name は入力名そのまま、reading は読み方 (カナ等)。",
    "- formedYear は不明なら 0、年だけが必要。",
    "- origin は活動拠点 (都道府県・市区町村レベル)。不明なら空文字。",
    "- members は現行ラインナップ。役割 (Vo/Gt 等) を括弧で添えてよい。",
    "- genres は最大4。",
    "- tagline は1文 (40字程度)、bio は3〜5文。",
    "- photoUrl は **画像ファイルへの直リンク URL**。最重要かつ最も間違いやすい項目。",
    "",
    "  ⚠️ **絶対の禁忌**: あなたは Spotify CDN (https://i.scdn.co/image/<hash>) や Apple Music CDN (https://*.mzstatic.com/...) の URL **パターン**を学習で知っているが、",
    "  個別バンドの hash 部分は知らない。それを **想像で埋めて URL を構築するのは捏造であり厳禁**。実際にツール出力で目にした文字列のみ返すこと。",
    "  「i.scdn.co/image/ で始まるはずだから ab6761610000e5eb の後に適当な 24文字足そう」のような行為を絶対にしない。",
    "",
    "  正しい入手手順:",
    "    1) web_search で `${bandName} site:open.spotify.com` または `${bandName} spotify` を検索",
    "    2) **必ず open_page アクションでアーティストページを開く** (https://open.spotify.com/artist/xxxxx)",
    "    3) 開いたページの HTML 内から `<meta property=\"og:image\" content=\"https://i.scdn.co/image/...\">` をそのまま読み取る",
    "    4) その content 値をそのまま photoUrl に入れる (1文字も改変しない)",
    "  Wikipedia / 音楽メディア記事も同じ要領: open_page してから og:image, twitter:image, または記事中の <img src> を抽出。",
    "",
    "  受け入れ可能な URL のソース:",
    "    - i.scdn.co/image/...  (Spotify。og:image から取得した実物のみ)",
    "    - is*-ssl.mzstatic.com/image/...  (Apple Music の実物)",
    "    - upload.wikimedia.org/wikipedia/commons/...  (Wikimedia の実物)",
    "    - 音楽メディア記事 (natalie.mu, rockinon.com 等) の <img> src の実物",
    "    - 公式サイト・Bandcamp・SoundCloud の <img> src の実物",
    "",
    "  ダメな URL (絶対に返さない):",
    "    - 自分で組み立てた CDN 風 URL",
    "    - https://open.spotify.com/artist/...  (HTML ページ — og:image を読んでから i.scdn.co URL を返すこと)",
    "    - https://ja.wikipedia.org/wiki/...    (HTML ページ)",
    "",
    "  実在を確信できない URL は **必ず空文字** を返す。捏造より空が圧倒的に良い。",
    "- tracks は代表曲 (最大3): title / album / year(数字) / description (1〜2文)。",
    "- interview は、Web 上で見つかった**実在のインタビュー記事から**の Q&A 抜粋のみ (最大3)。各項目に source として記事 URL を必ず付ける。回答は原文に近い表現で、過度に意訳しない。インタビュー記事が見つからなければ interview は空配列で返す (絶対に捏造しない)。",
    "- links は公式サイト / SNS / Bandcamp / Spotify など最大6 (label と url)。",
    "- 同名異人の可能性がある場合は、日本のライブハウスフライヤー文脈に最も合致するバンドに絞る。",
    "- 不明な情報は推測せず空文字 / 空配列 / 0 を入れる。",
  ].join("\n");

  log(rid, "→ research+format request", {
    model: RESEARCH_MODEL,
    search_context_size: SEARCH_CONTEXT_SIZE,
    prompt,
  });

  const resp = await client.responses.create({
    model: RESEARCH_MODEL,
    tools: [{ type: "web_search", search_context_size: SEARCH_CONTEXT_SIZE }],
    tool_choice: "auto",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "Band",
        strict: true,
        schema: BAND_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  let searchCalls = 0;
  for (const item of resp.output ?? []) {
    if (item.type === "web_search_call") searchCalls++;
  }

  const text = (resp as { output_text?: string }).output_text ?? "";
  log(rid, `← research raw response (web_search calls: ${searchCalls})`, text);

  if (!text) throw new Error("empty response from research step");
  return JSON.parse(text) as FormattedBand;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * 画像 URL を厳格に検証。LLM が CDN URL パターンを捏造する事故を確実に潰すため
 * 4xx/5xx は一切通さない。CDN がボットを弾くケースは User-Agent をブラウザ風にして対処。
 */
async function validateImageUrl(url: string, rid: string): Promise<boolean> {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) {
    log(rid, "photoUrl rejected (not http/https)", url);
    return false;
  }
  // HTML ページが明らかな URL を事前ブロック
  if (/^https?:\/\/(open\.spotify\.com|[a-z]{2,3}\.wikipedia\.org)\//i.test(url)) {
    log(rid, "photoUrl rejected (HTML page, not image)", url);
    return false;
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Range: "bytes=0-0",
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timer);

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!res.ok && res.status !== 206) {
      log(rid, `photoUrl REJECTED (status ${res.status})`, url);
      return false;
    }
    if (ct.startsWith("image/")) {
      log(rid, `photoUrl OK (${ct})`, url);
      return true;
    }
    if (ct.startsWith("text/")) {
      log(rid, `photoUrl REJECTED (text content-type: ${ct})`, url);
      return false;
    }
    // image/ でも text/* でもない (application/octet-stream など) は通す
    log(rid, `photoUrl OK (ambiguous ct=${ct})`, url);
    return true;
  } catch (err) {
    log(rid, `photoUrl REJECTED (fetch failed: ${(err as Error).message})`, url);
    return false;
  }
}

async function composeBand(
  f: FormattedBand,
  fallbackName: string,
  paletteIndex: number,
  rid: string,
): Promise<Band> {
  const palette = HERO_PALETTES[paletteIndex % HERO_PALETTES.length];

  const tracks: Track[] = (f.tracks ?? []).slice(0, 3).map((t) => ({
    title: String(t.title ?? ""),
    album: String(t.album ?? ""),
    year: Number(t.year) || 0,
    description: String(t.description ?? ""),
  }));

  const interview: QA[] = (f.interview ?? []).slice(0, 3).map((qa) => ({
    q: String(qa.q ?? ""),
    a: String(qa.a ?? ""),
    source: qa.source ? String(qa.source) : undefined,
  }));

  const links: RelatedLink[] = (f.links ?? []).slice(0, 6).map((l) => ({
    label: String(l.label ?? ""),
    url: String(l.url ?? "#"),
  }));

  const photoCandidate = (f.photoUrl ?? "").trim();
  const photoOk = await validateImageUrl(photoCandidate, rid);

  return {
    id: slugify(f.name || fallbackName),
    name: f.name || fallbackName,
    reading: f.reading || "",
    formedYear: Number(f.formedYear) || 0,
    origin: f.origin || "",
    members: (f.members ?? []).map(String).filter(Boolean),
    genres: (f.genres ?? []).map(String).filter(Boolean),
    tagline: f.tagline || "",
    hero: palette,
    photoUrl: photoOk ? photoCandidate : undefined,
    bio: f.bio || "",
    interview,
    tracks,
    links,
  };
}
