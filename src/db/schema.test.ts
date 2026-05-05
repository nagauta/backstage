/**
 * DB スキーマの smoke test。
 * in-memory libSQL に drizzle のマイグレーションを流し、
 * gigs / artists / gig_artists の基本 CRUD と JSON カラムが期待通り動くことを確認する。
 */
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { artists, gigArtists, gigs } from "./schema";

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

describe("db schema (in-memory libSQL)", () => {
  let client: Client;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  });

  afterAll(() => {
    client.close();
  });

  test("gig / artist / gig_artists を join で取り回せる + JSON カラムが復元される", async () => {
    const now = Date.now();

    await db.insert(gigs).values({
      id: "gig_1",
      slug: "shimokita-2026-05-10",
      status: "draft",
      title: "Shimokita Noise Night",
      date: "2026-05-10",
      venue: "下北沢SHELTER",
      sourceUrl: "https://example.com/event/1",
      intro: "ノイズ4組",
      aiWarnings: ["Dropped 1 non-artist string"],
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(artists).values({
      id: "art_1",
      slug: "moonlit-static",
      name: "Moonlit Static",
      reading: "ムーンリット・スタティック",
      formedYear: 2019,
      origin: "東京都・下北沢",
      tagline: "夜の街を溶かすノイズと甘いメロディ",
      bio: "下北沢のライブハウスで結成された3人組。",
      photoUrl: "https://example.com/p.jpg",
      spotifyArtistUrl: "https://open.spotify.com/artist/abc",
      members: ["蒼井 凛 (Vo/Gt)", "中野 ハル (Ba)", "三上 蓮 (Dr)"],
      genres: ["Shoegaze", "Dream Pop"],
      tracks: [
        { title: "Velvet Static", album: "Velvet Static EP", year: 2023, description: "代表曲" },
      ],
      interview: [{ q: "バンド名の由来は？", a: "深夜のホワイトノイズから。" }],
      links: [{ label: "Bandcamp", url: "https://example.bandcamp.com" }],
      researchedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(gigArtists).values({
      gigId: "gig_1",
      artistId: "art_1",
      position: 0,
      curatorNote: "ヘッドライナー、必聴。",
    });

    // JSON カラム復元確認
    const fetchedArtist = await db
      .select()
      .from(artists)
      .where(eq(artists.id, "art_1"));
    expect(fetchedArtist).toHaveLength(1);
    expect(fetchedArtist[0].members).toEqual([
      "蒼井 凛 (Vo/Gt)",
      "中野 ハル (Ba)",
      "三上 蓮 (Dr)",
    ]);
    expect(fetchedArtist[0].tracks).toHaveLength(1);
    expect(fetchedArtist[0].tracks[0].title).toBe("Velvet Static");
    expect(fetchedArtist[0].tracks[0].year).toBe(2023);

    // gig 側の JSON 配列も確認
    const fetchedGig = await db.select().from(gigs).where(eq(gigs.id, "gig_1"));
    expect(fetchedGig[0].aiWarnings).toEqual(["Dropped 1 non-artist string"]);
    expect(fetchedGig[0].status).toBe("draft");

    // join: gig_artists 経由で gig + artist を引く
    const joined = await db
      .select({
        gigSlug: gigs.slug,
        gigTitle: gigs.title,
        artistName: artists.name,
        position: gigArtists.position,
        note: gigArtists.curatorNote,
      })
      .from(gigArtists)
      .innerJoin(gigs, eq(gigs.id, gigArtists.gigId))
      .innerJoin(artists, eq(artists.id, gigArtists.artistId));

    expect(joined).toEqual([
      {
        gigSlug: "shimokita-2026-05-10",
        gigTitle: "Shimokita Noise Night",
        artistName: "Moonlit Static",
        position: 0,
        note: "ヘッドライナー、必聴。",
      },
    ]);
  });

  test("gig 削除で gig_artists が cascade 削除される", async () => {
    const now = Date.now();

    await db.insert(gigs).values({
      id: "gig_cascade",
      slug: "cascade-test",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(artists).values({
      id: "art_cascade",
      slug: "cascade-artist",
      name: "Cascade",
      researchedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(gigArtists).values({
      gigId: "gig_cascade",
      artistId: "art_cascade",
      position: 0,
    });

    await db.delete(gigs).where(eq(gigs.id, "gig_cascade"));

    const remaining = await db
      .select()
      .from(gigArtists)
      .where(eq(gigArtists.gigId, "gig_cascade"));
    expect(remaining).toHaveLength(0);

    // artist 本体は残っている (gig_artists だけ cascade)
    const stillArtist = await db
      .select()
      .from(artists)
      .where(eq(artists.id, "art_cascade"));
    expect(stillArtist).toHaveLength(1);
  });
});
