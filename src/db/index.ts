import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __libsqlClient__: Client | undefined;
}

function buildClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Use `file:./local.db` for a local SQLite file, " +
        "`http://127.0.0.1:8080` when running `turso dev`, " +
        "or your Turso `libsql://...` URL for production.",
    );
  }
  return createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

const client = globalThis.__libsqlClient__ ?? buildClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__libsqlClient__ = client;
}

export const db = drizzle(client, { schema });
export { schema };
