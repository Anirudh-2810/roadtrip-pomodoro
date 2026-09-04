import { Resend } from "resend";

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export function fromAddress(): string {
  return process.env.RESEND_FROM || "Pomodoro <onboarding@resend.dev>";
}

export async function sendSessionEmail(opts: {
  to: string;
  intent?: string;
  durationSec: number;
  preset: string;
  completed: boolean;
}): Promise<{ id?: string; error?: string }> {
  const resend = getResend();
  if (!resend) return { error: "Email not configured" };
  const mins = Math.round(opts.durationSec / 60);
  const subject = opts.completed
    ? `✅ Pomodoro complete — ${mins}m ${opts.preset} — ${opts.intent ?? "focus session"}`
    : `⏱ Pomodoro logged — ${mins}m`;
  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: opts.to,
      subject,
      html: `
        <div style="font-family: ui-sans-serif,system-ui; max-width:560px; margin:0 auto; padding:24px; background:#09090B; color:#fafafa; border-radius:16px; border:1px solid rgba(255,255,255,0.08)">
          <h1 style="margin:0 0 8px; font-size:20px;">${opts.completed ? "Journey completed ✓" : "Session logged"}</h1>
          <p style="margin:0 0 16px; color:#a1a1aa; font-size:14px;">${opts.intent ? `Intent: ${escapeHtml(opts.intent)}` : "Deep work session"}</p>
          <div style="display:inline-block; padding:8px 12px; background:#121212; border:1px solid rgba(255,255,255,0.08); border-radius:10px; font-variant-numeric: tabular-nums;">
            <strong style="color:#10b981;">${mins}m</strong> <span style="color:#fafafa;">· ${escapeHtml(opts.preset)}</span> <span style="color:#71717a;">· ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
          </div>
          <p style="margin:16px 0 0; font-size:12px; color:#71717a;">You're receiving this because you enabled auto-email per Pomodoro. Disable in Settings → Email Preferences.</p>
          <p style="margin:8px 0 0; font-size:12px; color:#71717a;"><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/settings" style="color:#10b981;">Manage preferences</a> · <a href="#" style="color:#71717a;">Unsubscribe</a></p>
        </div>
      `,
      text: `${subject}\n${mins}m · ${opts.preset} · ${opts.intent ?? ""}\n${new Date().toISOString()}`,
      headers: {
        "List-Unsubscribe": `<${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/email/unsubscribe>`,
      },
    });
    if (error) return { error: error.message ?? String(error) };
    return { id: data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

export async function sendDigestEmail(opts: {
  to: string;
  period: "daily" | "weekly";
  stats: { completed: number; totalMin: number; streak: number };
  rows: Array<{ date: string; preset: string; mins: number; intent?: string }>;
}): Promise<{ id?: string; error?: string }> {
  const resend = getResend();
  if (!resend) return { error: "Email not configured" };
  const subject =
    opts.period === "daily"
      ? `Your Pomodoro daily — ${opts.stats.completed} sessions · ${opts.stats.totalMin}m · streak ${opts.stats.streak}`
      : `Your Pomodoro weekly — ${opts.stats.completed} sessions · ${opts.stats.totalMin}m`;
  const rowsHtml = opts.rows
    .slice(0, 10)
    .map(
      (r) =>
        `<tr><td style="padding:6px 8px; border:1px solid #27272a;">${r.date}</td><td style="padding:6px 8px; border:1px solid #27272a;">${escapeHtml(r.preset)}</td><td style="padding:6px 8px; border:1px solid #27272a;">${r.mins}m</td><td style="padding:6px 8px; border:1px solid #27272a;">${escapeHtml(r.intent ?? "")}</td></tr>`
    )
    .join("");
  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: opts.to,
      subject,
      html: `
        <div style="font-family: ui-sans-serif,system-ui; max-width:640px; margin:0 auto; padding:24px; background:#09090B; color:#fafafa; border-radius:16px; border:1px solid rgba(255,255,255,0.08)">
          <h1 style="margin:0 0 4px;">${opts.period === "daily" ? "Daily digest" : "Weekly digest"}</h1>
          <p style="margin:0 0 16px; color:#a1a1aa;">${opts.stats.completed} completed · ${opts.stats.totalMin} min · streak ${opts.stats.streak} day(s)</p>
          <table style="width:100%; border-collapse:collapse; font-size:13px;"><thead><tr><th style="text-align:left; padding:6px 8px; border:1px solid #27272a; background:#18181b;">Date</th><th style="padding:6px 8px; border:1px solid #27272a; background:#18181b;">Preset</th><th style="padding:6px 8px; border:1px solid #27272a; background:#18181b;">Min</th><th style="padding:6px 8px; border:1px solid #27272a; background:#18181b;">Intent</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="4" style="padding:12px; text-align:center; color:#71717a;">No sessions this period — hit the timer!</td></tr>'}</tbody></table>
          <p style="margin:16px 0 0; font-size:12px; color:#71717a;"><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard" style="color:#10b981;">Open dashboard</a></p>
        </div>
      `,
      text: `${subject}\n${opts.rows.map((r) => `${r.date} ${r.preset} ${r.mins}m ${r.intent ?? ""}`).join("\n")}`,
    });
    if (error) return { error: error.message ?? String(error) };
    return { id: data?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
