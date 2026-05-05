/**
 * Spotify モジュールの integration test。
 * fetch 全体を vi.stubGlobal でスタブし、token 取得 → 検索 → パース、までの
 * 流れを 1 ケース 1 関数の粒度でテストする。
 *
 * NOTE: spotify.ts はモジュール変数で token をキャッシュするので、
 * 各テスト前に vi.resetModules() で fresh import する。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: FetchHandler) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url, init);
    }),
  );
}

const tokenOk = () =>
  jsonResponse({ access_token: "TEST_TOKEN", expires_in: 3600 });

beforeEach(() => {
  vi.resetModules(); // module-level token cache を破棄
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test_id");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test_secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchArtist", () => {
  test("token 取得 → /search を叩いて、完全一致を popularity より優先して返す", async () => {
    stubFetch((url) => {
      if (url.startsWith("https://accounts.spotify.com/api/token")) {
        return tokenOk();
      }
      if (url.includes("type=artist")) {
        return jsonResponse({
          artists: {
            items: [
              {
                id: "low_pop_exact",
                name: "Moonlit Static",
                images: [{ url: "https://img/300", width: 300 }],
                external_urls: { spotify: "https://open.spotify.com/artist/low_pop_exact" },
                followers: { total: 1234 },
                popularity: 10,
                genres: ["shoegaze"],
              },
              {
                id: "high_pop_partial",
                name: "Moonlit Static (Cover)",
                popularity: 80,
              },
            ],
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { searchArtist } = await import("./spotify");
    const r = await searchArtist("Moonlit Static");

    expect(r).not.toBeNull();
    expect(r!.id).toBe("low_pop_exact"); // 完全一致 (+1000) が popularity を凌駕
    expect(r!.imageUrl).toBe("https://img/300");
    expect(r!.externalUrl).toBe("https://open.spotify.com/artist/low_pop_exact");
    expect(r!.genres).toEqual(["shoegaze"]);
  });

  test("末尾ピリオド付き名は sanitize クエリでフォールバック検索される", async () => {
    const queries: string[] = [];
    stubFetch((url) => {
      if (url.startsWith("https://accounts.spotify.com/api/token")) {
        return tokenOk();
      }
      if (url.includes("type=artist")) {
        const q = new URL(url).searchParams.get("q") ?? "";
        queries.push(q);
        // 1段目 (生クエリ "EARTHISTS.") は空、2段目 ("EARTHISTS") でヒット
        if (queries.length === 1) {
          return jsonResponse({ artists: { items: [] } });
        }
        return jsonResponse({
          artists: {
            items: [
              {
                id: "earthists",
                name: "EARTHISTS",
                external_urls: { spotify: "https://open.spotify.com/artist/earthists" },
                popularity: 30,
              },
            ],
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { searchArtist } = await import("./spotify");
    const r = await searchArtist("EARTHISTS.");

    expect(r?.id).toBe("earthists");
    expect(queries).toEqual(["EARTHISTS.", "EARTHISTS"]);
  });

  test("ヒットなしの場合は null", async () => {
    stubFetch((url) => {
      if (url.startsWith("https://accounts.spotify.com/api/token")) return tokenOk();
      return jsonResponse({ artists: { items: [] } });
    });

    const { searchArtist } = await import("./spotify");
    expect(await searchArtist("NoSuchBand")).toBeNull();
  });
});

describe("searchTrack", () => {
  test("artistId 一致 + タイトル完全一致のトラックを返す", async () => {
    stubFetch((url) => {
      if (url.startsWith("https://accounts.spotify.com/api/token")) return tokenOk();
      if (url.includes("type=track")) {
        return jsonResponse({
          tracks: {
            items: [
              {
                id: "wrong_artist",
                name: "Velvet Static",
                external_urls: { spotify: "https://open.spotify.com/track/wrong_artist" },
                album: { name: "Other", release_date: "2020-01-01" },
                artists: [{ id: "other", name: "Other Band" }],
              },
              {
                id: "match",
                name: "Velvet Static",
                external_urls: { spotify: "https://open.spotify.com/track/match" },
                album: { name: "Velvet Static EP", release_date: "2023-04-15" },
                artists: [{ id: "a1", name: "Moonlit Static" }],
              },
            ],
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { searchTrack } = await import("./spotify");
    const r = await searchTrack({
      artistName: "Moonlit Static",
      artistId: "a1",
      title: "Velvet Static",
    });

    expect(r).not.toBeNull();
    expect(r!.id).toBe("match"); // artistId 一致のものだけ採用
    expect(r!.album).toBe("Velvet Static EP");
    expect(r!.releaseYear).toBe(2023);
  });

  test("1段目で見つからなければフォールバッククエリを試す", async () => {
    let attempts = 0;
    stubFetch((url) => {
      if (url.startsWith("https://accounts.spotify.com/api/token")) return tokenOk();
      if (url.includes("type=track")) {
        attempts++;
        if (attempts === 1) {
          return jsonResponse({ tracks: { items: [] } });
        }
        return jsonResponse({
          tracks: {
            items: [
              {
                id: "fallback_hit",
                name: "YAIBA",
                external_urls: { spotify: "https://open.spotify.com/track/fallback_hit" },
                album: { name: "Single", release_date: "2024-08-01" },
                artists: [{ id: "a1", name: "SomeArtist" }],
              },
            ],
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { searchTrack } = await import("./spotify");
    const r = await searchTrack({
      artistName: "SomeArtist",
      artistId: "a1",
      title: "YAIBA (feat. Guest)",
    });

    expect(r?.id).toBe("fallback_hit");
    expect(attempts).toBeGreaterThanOrEqual(2); // フォールバックが効いている
  });
});
