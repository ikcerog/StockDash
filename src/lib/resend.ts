import type { Env } from "../types";
import { getSetting } from "./db";

export async function sendAlertEmail(env: Env, subject: string, html: string): Promise<void> {
  // Prefer the key stored in D1 settings; fall back to the Workers secret.
  // (D1 first so an updated key takes effect without touching secrets.)
  const d1Key = await getSetting(env.DB, "RESEND_API_KEY");
  const apiKey = d1Key || env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend API key is not configured");
  }
  const keySource = d1Key ? "D1 settings" : "Workers secret";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.ALERT_FROM_EMAIL,
      to: [env.ALERT_EMAIL],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend request failed (${res.status}, key from ${keySource}): ${text}`);
  }
}
