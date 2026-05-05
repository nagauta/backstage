import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { QA, RelatedLink, Track } from "@/lib/bands";

export const GIG_STATUSES = ["analyzing", "draft", "published", "archived"] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const gigs = sqliteTable(
  "gigs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),

    status: text("status", { enum: GIG_STATUSES }).notNull(),

    flyerUrl: text("flyer_url"),
    flyerHash: text("flyer_hash"),

    title: text("title").notNull().default(""),
    date: text("date"),
    venue: text("venue"),
    sourceUrl: text("source_url"),
    intro: text("intro").notNull().default(""),

    aiRaw: text("ai_raw"),
    aiWarnings: text("ai_warnings", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    analyzedAt: integer("analyzed_at"),

    createdAt: integer("created_at").notNull(),
    publishedAt: integer("published_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_gigs_status_published").on(t.status, t.publishedAt),
    index("idx_gigs_flyer_hash").on(t.flyerHash),
  ],
);

export type Gig = typeof gigs.$inferSelect;
export type NewGig = typeof gigs.$inferInsert;

export const artists = sqliteTable(
  "artists",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),

    name: text("name").notNull(),
    reading: text("reading").notNull().default(""),
    formedYear: integer("formed_year").notNull().default(0),
    origin: text("origin").notNull().default(""),
    tagline: text("tagline").notNull().default(""),
    bio: text("bio").notNull().default(""),
    photoUrl: text("photo_url"),
    spotifyArtistUrl: text("spotify_artist_url"),

    members: text("members", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    genres: text("genres", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    tracks: text("tracks", { mode: "json" })
      .$type<Track[]>()
      .notNull()
      .default(sql`'[]'`),
    interview: text("interview", { mode: "json" })
      .$type<QA[]>()
      .notNull()
      .default(sql`'[]'`),
    links: text("links", { mode: "json" })
      .$type<RelatedLink[]>()
      .notNull()
      .default(sql`'[]'`),

    researchedAt: integer("researched_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_artists_spotify")
      .on(t.spotifyArtistUrl)
      .where(sql`${t.spotifyArtistUrl} IS NOT NULL`),
    index("idx_artists_name").on(t.name),
  ],
);

export type Artist = typeof artists.$inferSelect;
export type NewArtist = typeof artists.$inferInsert;

export const gigArtists = sqliteTable(
  "gig_artists",
  {
    gigId: text("gig_id")
      .notNull()
      .references(() => gigs.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id),
    position: integer("position").notNull(),
    curatorNote: text("curator_note"),
  },
  (t) => [
    primaryKey({ columns: [t.gigId, t.artistId] }),
    index("idx_gig_artists_artist").on(t.artistId),
  ],
);

export type GigArtist = typeof gigArtists.$inferSelect;
export type NewGigArtist = typeof gigArtists.$inferInsert;
