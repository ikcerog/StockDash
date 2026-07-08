import { createRemoteJWKSet, jwtVerify } from "jose";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";

// Cached per-isolate; createRemoteJWKSet fetches keys lazily and refreshes
// them on unknown-kid, so one instance can live for the isolate's lifetime.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl = "";

/**
 * Defense-in-depth behind Cloudflare Access: verifies the
 * Cf-Access-Jwt-Assertion header that Access attaches after a user
 * authenticates. If the workers.dev route were ever flipped back to Public,
 * requests would arrive without a valid JWT and get rejected here.
 *
 * Local dev (`wrangler dev`) has no Access in front, so set
 * ACCESS_DEV_BYPASS="true" in .dev.vars to skip the check locally.
 */
export const requireAccessJwt = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (c.env.ACCESS_DEV_BYPASS === "true") {
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

  try {
    await jwtVerify(token, jwks, { issuer, audience: aud });
  } catch {
    return c.json({ error: "Invalid Cloudflare Access token" }, 403);
  }

  return next();
});
