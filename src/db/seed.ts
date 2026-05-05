/**
 * 開発用 seed。既存の BANDS 定数を artists テーブルに投入し、
 * 4 組をまとめたデモ gig を 1 件作る。冪等 (毎回テーブルを空にしてから挿入)。
 *
 * 実行: npm run db:seed
 */
import { BANDS } from "@/lib/bands";

import { db } from "./index";
import { artists, gigArtists, gigs } from "./schema";

const DEMO_GIG_ID = "gig_demo_shimokita";
const DEMO_GIG_SLUG = "demo-shimokita-genre-crash";

async function main() {
  console.log("🌱 seeding...");

  // 冪等性: gig_artists → gigs → artists の順で削除 (FK 違反を避ける)
  await db.delete(gigArtists);
  await db.delete(gigs);
  await db.delete(artists);

  const now = Date.now();

  await db.insert(artists).values(
    BANDS.map((b) => ({
      id: b.id,
      slug: b.id,
      name: b.name,
      reading: b.reading,
      formedYear: b.formedYear,
      origin: b.origin,
      tagline: b.tagline,
      bio: b.bio,
      photoUrl: b.photoUrl ?? null,
      spotifyArtistUrl: b.spotifyArtistUrl ?? null,
      members: b.members,
      genres: b.genres,
      tracks: b.tracks,
      interview: b.interview,
      links: b.links,
      researchedAt: now,
      createdAt: now,
      updatedAt: now,
    })),
  );

  await db.insert(gigs).values({
    id: DEMO_GIG_ID,
    slug: DEMO_GIG_SLUG,
    status: "published",
    title: "Shimokita Genre Crash",
    date: "2026-05-10",
    venue: "下北沢SHELTER",
    sourceUrl: "https://example.com/gig/demo",
    intro:
      "シューゲイザー、マスロック、シティポップ、ハードコア。ジャンルが交差する一夜の対バン。",
    aiWarnings: [],
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  });

  await db.insert(gigArtists).values(
    BANDS.map((b, i) => ({
      gigId: DEMO_GIG_ID,
      artistId: b.id,
      position: i,
      curatorNote:
        i === 0
          ? "オープニング、轟音から幕開け。"
          : i === BANDS.length - 1
            ? "ヘッドライナー、必見。"
            : null,
    })),
  );

  console.log(`✓ seeded ${BANDS.length} artists + 1 gig (${DEMO_GIG_SLUG})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✖ seed failed:", err);
    process.exit(1);
  });
