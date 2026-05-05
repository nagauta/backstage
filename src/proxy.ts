import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REALM = "Backstage Admin";

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export function proxy(request: NextRequest): NextResponse {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    // Fail closed: refuse admin surface entirely if no password configured.
    return new NextResponse(
      "Admin disabled: ADMIN_PASSWORD is not set on the server.",
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
      const sep = decoded.indexOf(":");
      const provided = sep >= 0 ? decoded.slice(sep + 1) : decoded;
      if (safeCompare(provided, password)) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return unauthorized();
}

export const config = {
  matcher: ["/admin/:path*", "/api/analyze"],
};
