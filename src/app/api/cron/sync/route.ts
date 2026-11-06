import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAll } from "@/lib/sync/run";

// Vercel Cron calls this (see vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const result = await syncAll(createAdminClient(), 250_000);
  return Response.json(result);
}
