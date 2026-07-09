import { createRemoteJWKSet, jwtVerify } from "jose";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

// Cached per-isolate; createRemoteJWKSet fetches keys lazily and refreshes
// them on unknown-kid, so one instance can live for the isolate's lifetime.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl = "";

/**
 * Defense-in-depth behind Cloudflare Access: verifies the
 * Cf-Access-Jwt-Assertion header that Access attaches after a user
 * authenticates, and exposes the token's verified email claim as the
 * request's identity (c.get("userEmail")). If the workers.dev route were
 * ever flipped back to Public, requests would arrive without a valid JWT
 * and get rejected here.
 *
 * Local dev (`wrangler dev`) has no Access in front, so set
 * ACCESS_DEV_BYPASS="true" in .dev.vars to skip the check locally
 * (optionally with ACCESS_DEV_EMAIL to impersonate a specific user).
 */
export const requireAccessJwt = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ACCESS_DEV_BYPASS === "true") {
    c.set("userEmail", (c.env.ACCESS_DEV_EMAIL || "dev@localhost").toLowerCase());
    return next();
  }

  const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
  const aud = c.env.ACCESS_AUD;
  if (!teamDomain || !aud) {
    return c.json({ error: "Access JWT validation is not configured" }, 403);
  }

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) {
    return c.json({ error: "Missing Cloudflare Access token" }, 403);
  }

  const issuer = `https://${teamDomain}.cloudflareaccess.com`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  if (!jwks || jwksUrl !== certsUrl) {
    jwks = createRemoteJWKSet(new URL(certsUrl));
    jwksUrl = certsUrl;
  }

  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud });
    email = payload.email;
  } catch {
    return c.json({ error: "Invalid Cloudflare Access token" }, 403);
  }

  // Service tokens authenticate without a user email; this app's data is
  // per-user, so only identity-bearing logins are accepted.
  if (typeof email !== "string" || email === "") {
    return c.json({ error: "Access token has no user email" }, 403);
  }

  c.set("userEmail", email.toLowerCase());
  return next();
});
