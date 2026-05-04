import OpenAI from "openai";
import type { Band, QA, Track, RelatedLink } from "@/lib/bands";
import {
  isSpotifyConfigured,
  searchArtist,
  searchTrack,
  type SpotifyArtist,
} from "@/lib/spotify";

export const runtime = "nodejs";
export const maxDuration = 300;

const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
const RESEARCH_MODEL = process.env.OPENAI_RESEARCH_MODEL ?? "gpt-4o";
const SEARCH_CONTEXT_SIZE =
  (process.env.OPENAI_SEARCH_CONTEXT_SIZE as "low" | "medium" | "high" | undefined) ?? "low";
const MAX_BANDS = Number(process.env.OPENAI_MAX_BANDS ?? "8");

type AnalyzeRequest = { image?: string };
type AnalyzeError = { ok: false; error: string };

export type VerifyEventInfo = {
  found: boolean;
  title: string;
  date: string;
  venue: string;
  sourceUrl: string;
  lineupConsistent: boolean;
};

export type VerifyDropped = { name: string; reason: string };

export type AnalyzeEvent =
  | { type: "phase"; step: string; msg: string }
  | { type: "vision_done"; names: string[] }
  | {
      type: "verify_done";
      verified: string[];
      dropped: VerifyDropped[];
      event: VerifyEventInfo;
    }
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

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// =========================================================================
// Schemas (3 つに分割: profile / interview / photo)
// =========================================================================

const PROFILE_SCHEMA = {
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
    "bio",
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
    bio: { type: "string" },
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

const INTERVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["interview"],
  properties: {
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
  },
} as const;

const PHOTO_CANDIDATES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "source", "note"],
        properties: {
          url: { type: "string" },
          source: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

const PHOTO_PICK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bestIndex", "reason"],
  properties: {
    bestIndex: { type: "integer" }, // -1 if none
    reason: { type: "string" },
  },
} as const;

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates", "event"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "isArtist", "reason"],
        properties: {
          name: { type: "string" },
          isArtist: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
    event: {
      type: "object",
      additionalProperties: false,
      required: [
        "found",
        "title",
        "date",
        "venue",
        "sourceUrl",
        "lineupConsistent",
      ],
      properties: {
        found: { type: "boolean" },
        title: { type: "string" }, // ツアー名 / 公演名 (空文字なら不明)
        date: { type: "string" }, // YYYY-MM-DD があれば、無ければ空文字
        venue: { type: "string" },
        sourceUrl: { type: "string" },
        lineupConsistent: { type: "boolean" }, // 候補と公演ページの出演者が概ね一致
      },
    },
  },
} as const;

// =========================================================================
// Utils
// =========================================================================

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

// =========================================================================
// POST handler (SSE)
// =========================================================================

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

        // === Phase 1.5: verify (実在判定 + イベント特定) ===
        send({
          type: "phase",
          step: "verify",
          msg: "候補とイベントを検証中…",
        });
        const tV = Date.now();
        let verifiedNames: string[] = names;
        let verifyEventInfo: VerifyEventInfo = {
          found: false,
          title: "",
          date: "",
          venue: "",
          sourceUrl: "",
          lineupConsistent: false,
        };
        try {
          const verify = await verifyBandNames(client, names, rid);
          log(rid, `① verify done in ${Date.now() - tV}ms`, verify);
          verifiedNames = verify.candidates
            .filter((c) => c.isArtist)
            .map((c) => c.name);
          verifyEventInfo = verify.event;
          const dropped: VerifyDropped[] = verify.candidates
            .filter((c) => !c.isArtist)
            .map((c) => ({ name: c.name, reason: c.reason }));
          if (dropped.length > 0) {
            warnings.push(
              `Dropped ${dropped.length} non-artist string(s): ${dropped
                .map((d) => `"${d.name}" (${d.reason})`)
                .join(", ")}`,
            );
          }
          if (verify.event.found) {
            log(rid, "verify: event identified", verify.event);
            warnings.push(
              `Event identified: ${verify.event.title || "(no title)"}${
                verify.event.date ? ` / ${verify.event.date}` : ""
              }${verify.event.venue ? ` @ ${verify.event.venue}` : ""}${
                verify.event.lineupConsistent ? " (lineup consistent)" : ""
              }`,
            );
          }
          send({
            type: "verify_done",
            verified: verifiedNames,
            dropped,
            event: verifyEventInfo,
          });
        } catch (err) {
          // verify は soft fail: 失敗したら生の names で続行
          const msg = (err as Error).message;
          log(rid, `✖ verify failed (soft, using raw names): ${msg}`);
          warnings.push(`verify step failed: ${msg}`);
        }

        if (verifiedNames.length === 0) {
          send({
            type: "fatal",
            error: "No valid artists detected after verification.",
          });
          controller.close();
          return;
        }

        const targets = verifiedNames.slice(0, MAX_BANDS);
        if (verifiedNames.length > targets.length) {
          warnings.push(
            `Detected ${verifiedNames.length} verified bands, processing first ${targets.length} (OPENAI_MAX_BANDS=${MAX_BANDS}).`,
          );
        }

        // === Phase 2: research bands in parallel (each band = 3 sub-tasks parallel) ===
        send({
          type: "phase",
          step: "research",
          msg: `${targets.length}バンド × 3 並列調査 (プロフ / インタビュー / アー写)`,
        });
        log(rid, `② research start: ${targets.length} bands × 3 sub-tasks`, { targets });
        const t2 = Date.now();

        const slots: (Band | undefined)[] = new Array(targets.length).fill(undefined);

        await Promise.all(
          targets.map(async (name, i) => {
            send({ type: "band_start", index: i, name });
            try {
              const onStep = (msg: string) => send({ type: "band_step", index: i, msg });
              const band = await researchBandParallel(client, name, i, `${rid}#${i}`, onStep);
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

        log(rid, `② research done in ${Date.now() - t2}ms`);

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

// =========================================================================
// Vision: extract band names
// =========================================================================

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

// =========================================================================
// Verify: 候補名の実在判定 + イベント (ツアー / 公演) 特定
// =========================================================================
//
// vision で抽出した文字列には会場名・主催・ツアータイトル・装飾コピーが
// 混入しがち。1 LLM コール (web_search 付き) で:
//   - 各候補が実在アーティストか
//   - フライヤー本体の公演ページ (ツアー / 共演イベント) が web 上に存在するか
// を判定し、isArtist=true の候補だけ research に進める。

type VerifyCandidate = { name: string; isArtist: boolean; reason: string };
type VerifyResult = {
  candidates: VerifyCandidate[];
  event: VerifyEventInfo;
};

async function verifyBandNames(
  client: OpenAI,
  rawNames: string[],
  rid: string,
): Promise<VerifyResult> {
  const numbered = rawNames.map((n, i) => `  ${i + 1}. ${n}`).join("\n");
  const prompt = [
    "以下は日本のライブハウス / コンサートフライヤーから OCR で抽出した文字列リスト。",
    "ただし会場名・主催・ツアータイトル・装飾コピー・チケット情報等が混入している可能性がある。",
    "",
    "候補:",
    numbered,
    "",
    "タスク 1 (各候補): web_search で「実在する演奏アーティスト / バンド / DJ」か検証する。",
    "  - Spotify / Bandcamp / SoundCloud / natalie.mu / 公式 SNS / レーベル等にヒットすれば isArtist: true。",
    "  - 会場名 (例: 下北沢SHELTER) / ツアータイトル / スポンサー / コピー文 / 日付・時刻表記は isArtist: false。",
    "  - 同名異人が居ても、いずれかが実在アーティストであれば isArtist: true (絞り込みは後段で行う)。",
    "  - reason は 1 文で根拠を簡潔に (例: 'Spotify に該当アーティストあり', '会場名 (下北沢SHELTER)')。",
    "",
    "タスク 2 (イベント特定): 候補名を組み合わせた検索で、フライヤー本体の公演 / ツアーページを探す。",
    "  - クエリ例: '<候補A> <候補B> 共演', '<候補A> <候補B> ライブ', '<候補A> ツアー <年>' 等。",
    "  - Tixee / e+ / livehouse 公式 / natalie イベント / ツアー特設サイト等にヒットしたら event.found: true。",
    "  - title (ツアー名 / 公演名)・date (YYYY-MM-DD があれば、無ければ空文字)・venue・sourceUrl を埋める。",
    "  - lineupConsistent: 見つかったページの出演者リストと候補リストの重なりが概ね半数以上で true。",
    "  - 見つからなければ event.found: false で他フィールドは空文字 / false。",
    "",
    "捏造禁止: 実際に web_search 結果で確認したものだけを返す。推測で埋めない。",
  ].join("\n");

  log(rid, "→ verify request", { model: RESEARCH_MODEL, prompt });

  const resp = await client.responses.create({
    model: RESEARCH_MODEL,
    tools: [{ type: "web_search", search_context_size: SEARCH_CONTEXT_SIZE }],
    tool_choice: "auto",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "BandLineupVerify",
        strict: true,
        schema: VERIFY_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const text = (resp as { output_text?: string }).output_text ?? "";
  log(rid, "← verify response", text);
  if (!text) throw new Error("empty verify response");
  return JSON.parse(text) as VerifyResult;
}

// =========================================================================
// Per-band research: 3 sub-tasks in parallel
// =========================================================================

type ProfileFields = {
  name: string;
  reading: string;
  formedYear: number;
  origin: string;
  members: string[];
  genres: string[];
  tagline: string;
  bio: string;
  tracks: {
    title: string;
    album: string;
    year: number;
    description: string;
    spotifyUrl?: string; // Spotify enrich 後に付与される (LLM スキーマ側には乗らない)
  }[];
  links: { label: string; url: string }[];
};

type InterviewItem = { q: string; a: string; source: string };
type SubStatus = "running" | "done" | "failed";

async function researchBandParallel(
  client: OpenAI,
  bandName: string,
  paletteIndex: number,
  rid: string,
  onStep: (msg: string) => void,
): Promise<Band> {
  const status = { profile: "running", interview: "running", photo: "running" } as Record<
    "profile" | "interview" | "photo",
    SubStatus
  >;
  const renderStep = () => {
    const mark = (s: SubStatus) => (s === "done" ? "✓" : s === "failed" ? "✗" : "…");
    onStep(
      `プロフ${mark(status.profile)} / Interview${mark(status.interview)} / アー写${mark(status.photo)}`,
    );
  };
  renderStep();

  // Spotify artist 検索: photo 候補 + track enrich + links 補正に使う。
  // 設定が無ければ常に null を返すスタブ。失敗は soft fail。
  const spotifyArtistP: Promise<SpotifyArtist | null> = isSpotifyConfigured()
    ? searchArtist(bandName).catch((e: Error) => {
        log(rid, "spotify artist search failed (soft)", { message: e.message });
        return null;
      })
    : Promise.resolve(null);

  const profileP = fetchProfile(client, bandName, rid).then(
    (r) => {
      status.profile = "done";
      renderStep();
      return r;
    },
    (e: Error) => {
      status.profile = "failed";
      renderStep();
      throw e; // profile はクリティカル
    },
  );

  const interviewP = fetchInterview(client, bandName, rid).then(
    (r) => {
      status.interview = "done";
      renderStep();
      return r;
    },
    (e: Error) => {
      status.interview = "failed";
      renderStep();
      log(rid, "✖ interview sub-task failed (soft)", { message: e.message });
      return [] as InterviewItem[]; // soft fail
    },
  );

  const photoP = fetchPhotoUrl(client, bandName, rid, spotifyArtistP).then(
    (r) => {
      status.photo = "done";
      renderStep();
      return r;
    },
    (e: Error) => {
      status.photo = "failed";
      renderStep();
      log(rid, "✖ photo sub-task failed (soft)", { message: e.message });
      return ""; // soft fail
    },
  );

  const profile = await profileP;
  const interview = await interviewP;
  const photoCandidate = await photoP;
  const spotifyArtist = await spotifyArtistP;

  const photoOk = await validateImageUrl(photoCandidate, rid);

  // 代表曲を Spotify track 検索で enrich (spotifyUrl 付与)
  const enrichedTracks = await enrichTracksWithSpotify(
    profile.tracks,
    spotifyArtist,
    rid,
  );

  return composeBand(
    { ...profile, tracks: enrichedTracks },
    interview,
    photoOk ? photoCandidate : undefined,
    bandName,
    paletteIndex,
    spotifyArtist?.externalUrl,
  );
}

async function enrichTracksWithSpotify(
  tracks: ProfileFields["tracks"],
  spotifyArtist: SpotifyArtist | null,
  rid: string,
): Promise<ProfileFields["tracks"]> {
  if (!spotifyArtist || tracks.length === 0) return tracks;
  return Promise.all(
    tracks.map(async (t) => {
      try {
        const sp = await searchTrack({
          artistName: spotifyArtist.name,
          artistId: spotifyArtist.id,
          title: t.title,
        });
        if (sp) {
          log(
            rid,
            `spotify track match: "${t.title}" → "${sp.name}" (${sp.externalUrl})`,
          );
          return { ...t, spotifyUrl: sp.externalUrl };
        }
        log(rid, `spotify track miss: "${t.title}" (artist=${spotifyArtist.name})`);
        return t;
      } catch (err) {
        log(rid, `spotify track search failed for "${t.title}": ${(err as Error).message}`);
        return t;
      }
    }),
  );
}

// =========================================================================
// Sub-task: profile (name, reading, year, origin, members, genres, tagline, bio, tracks, links)
// =========================================================================

async function fetchProfile(
  client: OpenAI,
  bandName: string,
  rid: string,
): Promise<ProfileFields> {
  const prompt = [
    `バンド/アーティスト名: ${bandName}`,
    "",
    "上記バンドの **基本プロフィールと代表曲・関連リンクのみ** を Web を実際に検索 (web_search ツール) して一次情報ベースで調べ、JSON スキーマに従って返してください。インタビューやアー写の調査はこのコールでは不要 (別途並列で行うため)。",
    "",
    "- name は入力名そのまま、reading は読み方 (カナ等)。",
    "- formedYear は不明なら 0、年だけが必要。",
    "- origin は活動拠点 (都道府県・市区町村レベル)。不明なら空文字。",
    "- members は現行ラインナップ。役割 (Vo/Gt 等) を括弧で添えてよい。",
    "- genres は最大4。",
    "- tagline は1文 (40字程度)、bio は3〜5文。",
    "- tracks は代表曲 (最大3): title / album / year(数字) / description (1〜2文)。",
    "- links は公式サイト / SNS / Bandcamp / Spotify など最大6 (label と url)。Spotify や Bandcamp の URL は実在するアーティストページのみ。捏造禁止。",
    "- 同名異人の可能性がある場合は、日本のライブハウスフライヤー文脈に最も合致するバンドに絞る。",
    "- 不明な情報は推測せず空文字 / 空配列 / 0 を入れる。",
  ].join("\n");

  log(rid, "→ profile request", { model: RESEARCH_MODEL, prompt });

  const resp = await client.responses.create({
    model: RESEARCH_MODEL,
    tools: [{ type: "web_search", search_context_size: SEARCH_CONTEXT_SIZE }],
    tool_choice: "auto",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "BandProfile",
        strict: true,
        schema: PROFILE_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const text = (resp as { output_text?: string }).output_text ?? "";
  log(rid, "← profile response", text);
  if (!text) throw new Error("empty profile response");
  return JSON.parse(text) as ProfileFields;
}

// =========================================================================
// Sub-task: interview (Q&A excerpts from real interviews)
// =========================================================================

async function fetchInterview(
  client: OpenAI,
  bandName: string,
  rid: string,
): Promise<InterviewItem[]> {
  const prompt = [
    `バンド/アーティスト名: ${bandName}`,
    "",
    "上記バンドの **実在する公開インタビュー記事から、Q&A 形式の抜粋を最大3件** 集めてください。Web を実際に検索 (web_search) し、必要に応じてページを開いて記事本文を読むこと。",
    "",
    "ルール:",
    "- 各項目は { q, a, source } の3フィールド。",
    "- q は元記事のインタビューア質問 (要約してよいが意味は変えない)。",
    "- a はバンドメンバーの回答。**原文に近い表現で抜粋**し、過度に意訳しない。",
    "- source は記事の URL (実在する記事のみ)。",
    "- インタビュー記事が見つからなければ interview は **空配列**。捏造は厳禁。「ありそう」では絶対に書かない。",
    "- ナタリー (natalie.mu) / rockinon.com / CINRA / Mikiki / SPICE / Real Sound / Quetic 等の音楽メディアや、ライブハウス・レーベルのインタビュー記事を中心に探す。",
  ].join("\n");

  log(rid, "→ interview request", { model: RESEARCH_MODEL, prompt });

  const resp = await client.responses.create({
    model: RESEARCH_MODEL,
    tools: [{ type: "web_search", search_context_size: SEARCH_CONTEXT_SIZE }],
    tool_choice: "auto",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "BandInterview",
        strict: true,
        schema: INTERVIEW_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const text = (resp as { output_text?: string }).output_text ?? "";
  log(rid, "← interview response", text);
  if (!text) throw new Error("empty interview response");
  const parsed = JSON.parse(text) as { interview: InterviewItem[] };
  return (parsed.interview ?? []).slice(0, 3);
}

// =========================================================================
// Sub-task: photoUrl
//   ① web_search で候補 URL を最大5件収集
//   ② サーバ側で各 URL を到達性検証
//   ③ 残った候補をビジョンに見せて「メンバーが写ってる本物の press photo」を選択
// =========================================================================

type PhotoCandidate = { url: string; source: string; note: string };

async function fetchPhotoUrl(
  client: OpenAI,
  bandName: string,
  rid: string,
  spotifyArtistP: Promise<SpotifyArtist | null>,
): Promise<string> {
  // ⓪ Spotify アーティスト画像 (高確度) を最優先で試す
  const spotifyArtist = await spotifyArtistP;
  if (spotifyArtist?.imageUrl) {
    const ok = await validateImageUrl(spotifyArtist.imageUrl, rid);
    if (ok) {
      log(
        rid,
        `photo: using Spotify artist image (followers=${spotifyArtist.followers}, popularity=${spotifyArtist.popularity})`,
        spotifyArtist.imageUrl,
      );
      return spotifyArtist.imageUrl;
    }
    log(rid, "photo: Spotify image failed validation, falling back to LLM");
  }

  // ① LLM (web_search) で候補を収集
  const candidates = await gatherPhotoCandidates(client, bandName, rid);
  log(rid, `photo: ${candidates.length} candidates from LLM`);

  if (candidates.length === 0) {
    log(rid, "photo: no candidates");
    return "";
  }

  // ② 到達性検証 (並列)
  const reachable = (
    await Promise.all(
      candidates.map(async (c) => {
        const ok = await validateImageUrl(c.url, rid);
        return ok ? c : null;
      }),
    )
  ).filter((c): c is PhotoCandidate => c !== null);

  if (reachable.length === 0) {
    log(rid, "photo: all candidates failed reachability check");
    return "";
  }

  log(rid, `photo: ${reachable.length}/${candidates.length} candidates reachable`, {
    urls: reachable.map((r) => r.url),
  });

  if (reachable.length === 1) return reachable[0].url;

  // ③ ビジョンで「メンバーが写ってる」を選ぶ
  const best = await pickBestBandPhoto(client, bandName, reachable, rid);
  return best;
}

async function gatherPhotoCandidates(
  client: OpenAI,
  bandName: string,
  rid: string,
): Promise<PhotoCandidate[]> {
  const prompt = [
    `バンド/アーティスト名: ${bandName}`,
    "",
    "上記バンドの **press photo / アー写 / メンバー集合写真として使える画像 URL の候補** を **最大5件** 集める。Web 検索 + open_page を駆使すること。",
    "",
    "推奨検索クエリ (Google ライクに複数試す):",
    `  - "${bandName}" band photo press`,
    `  - "${bandName}" アー写`,
    `  - "${bandName}" メンバー 写真`,
    `  - "${bandName}" official photo`,
    `  - "${bandName}" site:natalie.mu  または  site:rockinon.com`,
    `  - "${bandName}" promo photo`,
    "",
    "URL 抽出手順:",
    "  1) ヒットしたページを **open_page** で開く",
    "  2) 次の場所から画像 URL を抽出:",
    '     - <meta property="og:image" content="...">',
    '     - <meta name="twitter:image" content="...">',
    "     - 記事中の <img src=\"...\"> でバンド写真と思しきもの",
    "  3) 各候補に source (どのページで見つけたか) と note (なぜ良さそうか) を添える",
    "",
    "優先する候補:",
    "  - 複数のバンドメンバーが映っているグループショット",
    "  - press kit / 公式 / プロモ写真と明記されているもの",
    "  - スタジオ撮影、街中での集合写真",
    "",
    "避けるべき (候補に入れない):",
    "  - アルバムジャケット (1人または抽象的なもの、ロゴだけのもの)",
    "  - バンドロゴ単体",
    "  - フライヤー / 公演ポスター",
    "  - ライブの遠景 (ステージ全体、観客込み)",
    "",
    "⚠️ 捏造禁止: 自分で URL を組み立てない。実際にツール出力で目にした URL のみ。",
    "確実に画像と分かる URL のみ。HTML ページ URL (open.spotify.com/..., wikipedia.org/wiki/... など) は候補にしない。",
    "見つからなければ candidates: [] を返す。",
  ].join("\n");

  log(rid, "→ photo candidates request", { model: RESEARCH_MODEL, prompt });

  const resp = await client.responses.create({
    model: RESEARCH_MODEL,
    tools: [{ type: "web_search", search_context_size: SEARCH_CONTEXT_SIZE }],
    tool_choice: "auto",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "PhotoCandidates",
        strict: true,
        schema: PHOTO_CANDIDATES_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const text = (resp as { output_text?: string }).output_text ?? "";
  log(rid, "← photo candidates response", text);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { candidates: PhotoCandidate[] };
    return (parsed.candidates ?? []).slice(0, 5);
  } catch {
    return [];
  }
}

async function pickBestBandPhoto(
  client: OpenAI,
  bandName: string,
  candidates: PhotoCandidate[],
  rid: string,
): Promise<string> {
  // gpt-4o-mini に複数画像を見せて選ばせる
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };
  const userContent: ContentPart[] = [
    {
      type: "text",
      text: [
        `バンド「${bandName}」の press photo / アー写として最適な画像を選んでください。`,
        "",
        "以下、候補画像 (0-indexed):",
        ...candidates.map((c, i) => `[${i}] ${c.note} (source: ${c.source})`),
        "",
        "選定基準 (上から優先):",
        "  - **複数のバンドメンバーが写っているグループ写真** (顔がはっきり見える)",
        "  - 1人だけでもアーティスト本人が写っている人物写真ならOK",
        "  - スタジオ・屋外問わず、人物にフォーカスしているもの",
        "",
        "除外:",
        "  - アルバムジャケット (人物が写っていない、抽象的、ロゴ的)",
        "  - バンドロゴだけ",
        "  - フライヤー / ポスター (文字が大きく入っている)",
        "  - ライブの遠景 (ステージ全体)",
        "  - 関係ない画像 (広告バナー、サムネ画像、UI 要素)",
        "",
        "全部該当しなければ bestIndex: -1 を返す。",
      ].join("\n"),
    },
    ...candidates.map<ContentPart>((c) => ({
      type: "image_url",
      image_url: { url: c.url },
    })),
  ];

  log(rid, "→ photo pick (vision) request", {
    model: VISION_MODEL,
    candidateCount: candidates.length,
  });

  let parsed: { bestIndex: number; reason: string } | null = null;
  try {
    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You evaluate candidate images and pick the one most suitable as a press/artist photo of a music band. You strictly avoid album covers, logos, flyers, posters, and unrelated images.",
        },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "PhotoPick",
          strict: true,
          schema: PHOTO_PICK_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    log(rid, "← photo pick response", raw);
    parsed = JSON.parse(raw) as { bestIndex: number; reason: string };
  } catch (err) {
    log(rid, `photo pick (vision) failed: ${(err as Error).message}`);
    // ビジョンが失敗したら最初の reachable 候補を返す
    return candidates[0]?.url ?? "";
  }

  if (!parsed) return candidates[0]?.url ?? "";

  const idx = parsed.bestIndex;
  if (idx < 0 || idx >= candidates.length) {
    log(rid, `photo pick: no candidate met criteria (reason: ${parsed.reason})`);
    return "";
  }
  log(rid, `photo pick: chose [${idx}] ${parsed.reason}`, candidates[idx].url);
  return candidates[idx].url;
}

// =========================================================================
// Photo URL validation
// =========================================================================

async function validateImageUrl(url: string, rid: string): Promise<boolean> {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) {
    log(rid, "photoUrl rejected (not http/https)", url);
    return false;
  }
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
    log(rid, `photoUrl OK (ambiguous ct=${ct})`, url);
    return true;
  } catch (err) {
    log(rid, `photoUrl REJECTED (fetch failed: ${(err as Error).message})`, url);
    return false;
  }
}

// =========================================================================
// composeBand: 3 sub-task の結果を Band 型へ統合
// =========================================================================

function composeBand(
  profile: ProfileFields,
  interview: InterviewItem[],
  photoUrl: string | undefined,
  fallbackName: string,
  paletteIndex: number,
  spotifyArtistUrl?: string,
): Band {
  const palette = HERO_PALETTES[paletteIndex % HERO_PALETTES.length];

  const tracks: Track[] = (profile.tracks ?? []).slice(0, 3).map((t) => ({
    title: String(t.title ?? ""),
    album: String(t.album ?? ""),
    year: Number(t.year) || 0,
    description: String(t.description ?? ""),
    spotifyUrl: t.spotifyUrl || undefined,
  }));

  const interviewClean: QA[] = (interview ?? []).slice(0, 3).map((qa) => ({
    q: String(qa.q ?? ""),
    a: String(qa.a ?? ""),
    source: qa.source ? String(qa.source) : undefined,
  }));

  const links: RelatedLink[] = (profile.links ?? []).slice(0, 6).map((l) => ({
    label: String(l.label ?? ""),
    url: String(l.url ?? "#"),
  }));

  // Spotify API で確定した URL があれば、LLM 由来の Spotify リンクを差し替え (or 追加)
  if (spotifyArtistUrl) {
    const idx = links.findIndex(
      (l) => /spotify/i.test(l.label) || /open\.spotify\.com/.test(l.url),
    );
    if (idx >= 0) {
      links[idx] = { label: "Spotify", url: spotifyArtistUrl };
    } else {
      links.unshift({ label: "Spotify", url: spotifyArtistUrl });
      if (links.length > 6) links.length = 6;
    }
  }

  return {
    id: slugify(profile.name || fallbackName),
    name: profile.name || fallbackName,
    reading: profile.reading || "",
    formedYear: Number(profile.formedYear) || 0,
    origin: profile.origin || "",
    members: (profile.members ?? []).map(String).filter(Boolean),
    genres: (profile.genres ?? []).map(String).filter(Boolean),
    tagline: profile.tagline || "",
    hero: palette,
    photoUrl: photoUrl || undefined,
    spotifyArtistUrl: spotifyArtistUrl || undefined,
    bio: profile.bio || "",
    interview: interviewClean,
    tracks,
    links,
  };
}
