// Fail-closed guard: production builds must not bake a localhost APP_URL.
// Runs as `prebuild`. Warns (not fails) outside Vercel production so local
// `npm run build` with .env.local localhost still works.
const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
const isVercelProd = process.env.VERCEL_ENV === "production";

if (isVercelProd) {
  if (!raw) {
    console.error("[check-app-url] FATAL: NEXT_PUBLIC_APP_URL is not set for Vercel production.");
    process.exit(1);
  }
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    console.error(`[check-app-url] FATAL: NEXT_PUBLIC_APP_URL is not a valid URL: ${raw}`);
    process.exit(1);
  }
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
    console.error(`[check-app-url] FATAL: NEXT_PUBLIC_APP_URL points to localhost in production: ${raw}`);
    console.error("[check-app-url] Fix: Vercel -> roadtrip-pomodoro -> Settings -> Environment Variables -> NEXT_PUBLIC_APP_URL=https://roadtrip-pomodoro-taupe.vercel.app (Production), then redeploy.");
    process.exit(1);
  }
  console.log(`[check-app-url] OK (Vercel production): ${raw}`);
} else {
  console.log(`[check-app-url] skip (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}, APP_URL=${raw || "unset"})`);
}
