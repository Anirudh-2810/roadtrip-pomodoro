// Display-only time formatting. Storage stays UTC ISO; UI shows IST,
// because raw `.slice(0,16)` on an ISO string renders UTC (5.5h behind IST).
export function formatIST(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}
