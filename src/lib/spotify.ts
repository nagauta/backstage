/**
 * Spotify Web API client (Client Credentials flow).
 * トークンはプロセス内でキャッシュ (1 時間有効)。
 * 失敗は呼び出し側で soft fail させる前提でエラーを投げる。
 */

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

type CachedToken = { token: string; expiresAt: number };
let cached: CachedToken | null = null;

export function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set");
  }

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`spotify token request failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cached.token;
}

async function spotifyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: ac.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      throw new Error(`spotify ${path} ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();

// =========================================================================
// Artist search
// =========================================================================

export type SpotifyArtist = {
  id: string;
  name: string;
  imageUrl?: string;
  imageWidth?: number;
  externalUrl: string;
  followers: number;
  popularity: number;
  genres: string[];
};

// Spotify レスポンスは欠落フィールドがあり得るので全 optional 扱いで受ける
type SearchArtistsResponse = {
  artists?: {
    items?: Array<{
      id?: string;
      name?: string;
      images?: Array<{ url?: string; width?: number; height?: number }>;
      external_urls?: { spotify?: string };
      followers?: { total?: number };
      popularity?: number;
      genres?: string[];
    }>;
  };
};

/**
 * Spotify 検索クエリ用にバンド名を整形する。
 * - 末尾の句読点 (`.` `!` `?` `,` `:` `;`) は Spotify の検索シンタックスとぶつかるので削除
 *   (例: "EARTHISTS." → "EARTHISTS")
 * - 連続スペースを 1 個に
 */
function sanitizeArtistQuery(name: string): string {
  return name
    .replace(/[.!?,;:]+$/, "")
    .replace(/[!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchArtist(name: string): Promise<SpotifyArtist | null> {
  // 末尾ピリオド等を含めたままでヒットしないことがあるので、まず生のクエリ → 失敗時に sanitize 版を試す
  const queries = [name];
  const sanitized = sanitizeArtistQuery(name);
  if (sanitized !== name && sanitized.length > 0) queries.push(sanitized);

  for (const query of queries) {
    const items = await fetchArtistSearch(query);
    if (items.length === 0) continue;

    const target = norm(sanitized || name);
    const scored = items.map((a) => {
      const exact = norm(a.name ?? "") === target ? 1000 : 0;
      return { a, score: exact + (a.popularity ?? 0) };
    });
    scored.sort((x, y) => y.score - x.score);
    const best = scored[0].a;

    if (!best.id) continue; // 壊れたレコードはスキップ

    const images = best.images ?? [];
    const usableImage =
      images.find((img) => (img.width ?? 0) >= 160) ?? images[0];

    return {
      id: best.id,
      name: best.name ?? name,
      imageUrl: usableImage?.url,
      imageWidth: usableImage?.width,
      externalUrl: best.external_urls?.spotify ?? "",
      followers: best.followers?.total ?? 0,
      popularity: best.popularity ?? 0,
      genres: best.genres ?? [],
    };
  }
  return null;
}

async function fetchArtistSearch(query: string) {
  const q = encodeURIComponent(query);
  const json = await spotifyFetch<SearchArtistsResponse>(
    `/search?q=${q}&type=artist&market=JP&limit=5`,
  );
  return json.artists?.items ?? [];
}

// =========================================================================
// Track search
// =========================================================================

export type SpotifyTrack = {
  id: string;
  name: string;
  externalUrl: string;
  album: string;
  releaseYear: number;
};

// Spotify レスポンスは欠落フィールドがあり得るので全 optional 扱い
type SearchTracksResponse = {
  tracks?: {
    items?: Array<{
      id?: string;
      name?: string;
      external_urls?: { spotify?: string };
      album?: { name?: string; release_date?: string };
      artists?: Array<{ id?: string; name?: string }>;
    }>;
  };
};

/**
 * 楽曲タイトルから Spotify 検索で噛みづらい部分を除去する。
 * - "(feat. ...)" / "(ft. ...)" / "(featuring ...)" 以降を末尾まで全削除 (入れ子括弧対応)
 * - 残った括弧書き (リミックス情報・年号等) を除去
 * - Spotify 検索で特殊扱いされる "!" / "?" を空白に置換
 *   (!! が NOT 演算子と衝突する事例があるため)
 * 例: "YAIBA (feat. タナカユーキ (SPARK!!SOUND!!SHOW!!))" → "YAIBA"
 */
function normalizeTrackTitle(title: string): string {
  let s = title;
  s = s.replace(/\s*[（(]\s*(feat\.?|ft\.?|featuring)[\s\S]*$/gi, "");
  s = s.replace(/\s*[（(][^（()）]*[）)]/g, "");
  s = s.replace(/[!?]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

type RawSpotifyTrackItem = NonNullable<
  NonNullable<SearchTracksResponse["tracks"]>["items"]
>[number];

async function spotifySearchTracks(query: string): Promise<RawSpotifyTrackItem[]> {
  const q = encodeURIComponent(query);
  const json = await spotifyFetch<SearchTracksResponse>(
    `/search?q=${q}&type=track&market=JP&limit=10`,
  );
  return json.tracks?.items ?? [];
}

function pickBestTrack(
  items: RawSpotifyTrackItem[],
  args: { artistName: string; artistId?: string; title: string },
): SpotifyTrack | null {
  if (items.length === 0) return null;

  // アーティスト一致のみ採用 (合致が無ければ null = 次のクエリへ)
  const targetArtist = norm(args.artistName);
  const matched = items.filter((t) => {
    const artists = t.artists ?? [];
    return args.artistId
      ? artists.some((a) => a.id === args.artistId)
      : artists.some((a) => norm(a.name ?? "") === targetArtist);
  });
  if (matched.length === 0) return null;

  // タイトル一致度でソート (正規化したタイトル基準)
  const targetTitle = norm(normalizeTrackTitle(args.title));
  const scored = matched.map((t) => {
    const cand = norm(t.name ?? "");
    const exact = cand === targetTitle ? 1000 : 0;
    const includes = cand.includes(targetTitle) || targetTitle.includes(cand) ? 100 : 0;
    return { t, score: exact + includes };
  });
  scored.sort((a, b) => b.score - a.score);
  const t = scored[0].t;

  if (!t.id) return null; // 壊れたレコードは採用しない

  return {
    id: t.id,
    name: t.name ?? args.title,
    externalUrl: t.external_urls?.spotify ?? "",
    album: t.album?.name ?? "",
    releaseYear: parseInt((t.album?.release_date ?? "").slice(0, 4), 10) || 0,
  };
}

export async function searchTrack(args: {
  artistName: string;
  artistId?: string;
  title: string;
}): Promise<SpotifyTrack | null> {
  const normalized = normalizeTrackTitle(args.title);
  const safeArtist = args.artistName.replace(/[!?]/g, " ").trim();

  // 段階的に広めていく検索クエリ。引用符は使わない (部分一致を許容)。
  const queries: string[] = [];
  queries.push(`track:${normalized} artist:${safeArtist}`);
  if (normalized !== args.title) {
    const safeOriginal = args.title.replace(/[!?]/g, " ").trim();
    queries.push(`track:${safeOriginal} artist:${safeArtist}`);
  }
  // フォールバック: artist フィルタを外してアーティスト ID/名で post-filter
  queries.push(`track:${normalized}`);

  for (const query of queries) {
    let items: RawSpotifyTrackItem[];
    try {
      items = await spotifySearchTracks(query);
    } catch (err) {
      console.warn(`[spotify] track search error for q="${query}":`, (err as Error).message);
      continue;
    }
    const picked = pickBestTrack(items, args);
    if (picked) return picked;
  }
  return null;
}
