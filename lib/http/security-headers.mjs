function supabaseConnectSources(value) {
  if (!value) return [];
  try {
    const url = new URL(value);
    const sources = [url.origin];
    if (url.protocol === "https:") sources.push(`wss://${url.host}`);
    if (url.protocol === "http:") sources.push(`ws://${url.host}`);
    return sources;
  } catch {
    return [];
  }
}

export function securityHeaders(env = process.env) {
  const connectSources = [
    "'self'",
    ...supabaseConnectSources(env.NEXT_PUBLIC_SUPABASE_URL),
  ];
  const scriptSources = ["'self'", "'unsafe-inline'"];
  if (env.NODE_ENV !== "production") scriptSources.push("'unsafe-eval'");
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
  ].join("; ");

  return Object.freeze([
    Object.freeze({ key: "Content-Security-Policy", value: csp }),
    Object.freeze({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    }),
    Object.freeze({ key: "Referrer-Policy", value: "no-referrer" }),
    Object.freeze({ key: "X-Content-Type-Options", value: "nosniff" }),
  ]);
}
