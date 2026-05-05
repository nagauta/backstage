import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  throw new Error(
    "TURSO_DATABASE_URL is not set. Set it in .env (e.g. file:./local.db) before running drizzle-kit.",
  );
}

const schema = "./src/db/schema.ts";
const out = "./drizzle";

// drizzle-kit の dialect: 'turso' は libsql:// / http:// 専用。
// ローカル開発で file: を使う場合は dialect: 'sqlite' に切り替える。
const isLocalFile = url.startsWith("file:");

export default isLocalFile
  ? defineConfig({
      dialect: "sqlite",
      schema,
      out,
      dbCredentials: { url },
    })
  : defineConfig({
      dialect: "turso",
      schema,
      out,
      dbCredentials: {
        url,
        authToken: process.env.TURSO_AUTH_TOKEN,
      },
    });
