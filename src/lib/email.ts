import type { Env } from "../types";
import { getSetting } from "./db";

async function sendViaBrevo(
  apiKey: string,
  senderEmail: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: "StockDash" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo request failed (${res.status}): ${text}`);
  }
}

async function sendViaResend(env: Env, to: string, subject: string, html: string): Promise<void> {
  // Prefer the key stored in D1 settings; fall back to the Workers secret.
  // (D1 first so an updated key takes effect without touching secrets.)
  const d1Key = await getSetting(env.DB, "RESEND_API_KEY");
  const apiKey = d1Key || env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend API key is not configured");
  }
  const keySource = d1Key ? "D1 settings" : "Workers secret";

  // The shared onboarding@resend.dev sender is sandboxed: Resend will only
  // deliver to the account owner's own address until a custom domain is
  // verified. Short-circuit with a clear explanation instead of letting
  // every other user hit a confusing 403 from the API.
  if (env.ALERT_FROM_EMAIL.includes("resend.dev")) {
    const ownerEmail = await getSetting(env.DB, "RESEND_ACCOUNT_EMAIL");
    if (ownerEmail && to.toLowerCase() !== ownerEmail.toLowerCase()) {
      throw new Error(
        `This app is using Resend's shared sandbox sender, which can only deliver to ${ownerEmail}` +
          ` (the Resend account owner) until a custom domain is verified at resend.com/domains.` +
          ` You're signed in as ${to}, so email alerts aren't available for your account yet.`,
      );
    }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.ALERT_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend request failed (${res.status}, key from ${keySource}): ${text}`);
  }
}

export async function sendAlertEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  // Brevo verifies a single sender address rather than a whole domain, so
  // once it's configured it can reach any recipient — prefer it over the
  // Resend sandbox fallback, which is stuck delivering to one address.
  const brevoKey = await getSetting(env.DB, "BREVO_API_KEY");
  const brevoSender = await getSetting(env.DB, "BREVO_SENDER_EMAIL");
  if (brevoKey && brevoSender) {
    return sendViaBrevo(brevoKey, brevoSender, to, subject, html);
  }

  return sendViaResend(env, to, subject, html);
}
