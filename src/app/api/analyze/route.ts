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
type AnalyzeResponse =
  | { ok: true; bands: Band[]; warnings?: string[] }
  | { ok: false; error: string };

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

export async function POST(req: Request): Promise<Response> {
  const rid = newReqId();
  const tStart = Date.now();
  log(rid, "▶ request received");

  if (!process.env.OPENAI_API_KEY) {
    log(rid, "✖ missing OPENAI_API_KEY");
    return Response.json(
      { ok: false, error: "OPENAI_API_KEY is not set on the server." } satisfies AnalyzeResponse,
      { status: 500 },
    );
  }

  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body." } satisfies AnalyzeResponse,
      { status: 400 },
    );
  }

  const image = body.image?.trim();
  if (!image || !image.startsWith("data:image/")) {
    return Response.json(
      { ok: false, error: "image (data URL) is required." } satisfies AnalyzeResponse,
      { status: 400 },
    );
  }
  log(rid, `image received (${image.length} chars)`);

  const client = new OpenAI();
  const warnings: string[] = [];

  // === Step 1: vision で出演バンド名抽出 ===
  let names: string[];
  const t1 = Date.now();
  try {
    names = await extractBandNames(client, image, rid);
  } catch (err) {
    log(rid, "✖ vision failed", { message: (err as Error).message });
    return Response.json(
      { ok: false, error: `vision: ${(err as Error).message}` } satisfies AnalyzeResponse,
      { status: 502 },
    );
  }
  log(rid, `① vision done in ${Date.now() - t1}ms`, { names });

  if (names.length === 0) {
    log(rid, "✖ no band names detected");
    return Response.json(
      { ok: false, error: "No band names detected in the flyer." } satisfies AnalyzeResponse,
      { status: 422 },
    );
  }

  // === Step 2: 全バンドを並列でリサーチ ===
  const targets = names.slice(0, MAX_BANDS);
  if (names.length > MAX_BANDS) {
    warnings.push(
      `${names.length} bands detected; capped at ${MAX_BANDS}. Adjust OPENAI_MAX_BANDS to change.`,
    );
  }
  log(rid, `② research+format start (${targets.length} bands in parallel)`, { targets });
  const t2 = Date.now();

  const results = await Promise.allSettled(
    targets.map((name, i) => researchAndFormat(client, name, `${rid}#${i}`)),
  );

  const bands: Band[] = [];
  results.forEach((r, i) => {
    const name = targets[i];
    if (r.status === "fulfilled") {
      bands.push(composeBand(r.value, name, i));
    } else {
      const msg = (r.reason as Error)?.message ?? String(r.reason);
      log(rid, `✖ research failed for "${name}"`, { message: msg });
      warnings.push(`research failed for "${name}": ${msg}`);
    }
  });

  log(rid, `② research+format done in ${Date.now() - t2}ms`, {
    succeeded: bands.length,
    failed: targets.length - bands.length,
  });

  if (bands.length === 0) {
    return Response.json(
      {
        ok: false,
        error: `research failed for all ${targets.length} bands. ${warnings.join(" / ")}`,
      } satisfies AnalyzeResponse,
      { status: 502 },
    );
  }

  log(rid, `✓ done in ${Date.now() - tStart}ms`, {
    bandCount: bands.length,
    bandNames: bands.map((b) => b.name),
  });

  return Response.json({ ok: true, bands, warnings } satisfies AnalyzeResponse);
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
    "- photoUrl はバンドのアー写 (アーティスト写真) として使える画像の **直リンク URL**。公式サイト / Bandcamp / Spotify の artist image / Wikipedia / 信頼できる音楽メディアの記事内画像など、なるべく公式に近いものを優先。jpg / jpeg / png / webp の直 URL であること。見つからなければ空文字。HTML ページ URL は不可。",
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

  // 検索ツールの利用回数 (ログ用)
  let searchCalls = 0;
  for (const item of resp.output ?? []) {
    if (item.type === "web_search_call") searchCalls++;
  }

  const text = (resp as { output_text?: string }).output_text ?? "";
  log(rid, `← research raw response (web_search calls: ${searchCalls})`, text);

  if (!text) throw new Error("empty response from research step");
  return JSON.parse(text) as FormattedBand;
}

function composeBand(f: FormattedBand, fallbackName: string, paletteIndex: number): Band {
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

  const photoUrl = (f.photoUrl ?? "").trim();
  const photoOk = /^https?:\/\/.+\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(photoUrl);

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
    photoUrl: photoOk ? photoUrl : undefined,
    bio: f.bio || "",
    interview,
    tracks,
    links,
  };
}
