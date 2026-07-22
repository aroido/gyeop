import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const root = new URL("../", import.meta.url);
const deadline = Date.now() + 10_000;
const wait = () => new Promise((resolve) => setTimeout(resolve, 250));
let output;
while (!output && Date.now() < deadline) {
  try {
    output = execFileSync(
      "pnpm",
      [
        "exec",
        "supabase",
        "status",
        "-o",
        "env",
        "--override-name",
        "api.url=SUPABASE_URL",
        "--override-name",
        "auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY",
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    await wait();
  }
}
if (!output) throw new Error("Local Supabase status did not become ready");
const local = Object.fromEntries(
  output
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], JSON.parse(match[2])]),
);

for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!local[name]) throw new Error(`Local Supabase did not report ${name}`);
}

let lastStatus = "no response";
while (Date.now() < deadline) {
  try {
    const response = await fetch(
      `${local.SUPABASE_URL}/rest/v1/rpc/consume_rate_limit`,
      {
        method: "POST",
        headers: {
          apikey: local.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${local.SUPABASE_SERVICE_ROLE_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_key_hash: `\\x${randomBytes(32).toString("hex")}`,
          p_action: "schema_readiness_probe",
          p_window_seconds: 60,
          p_limit: 1,
        }),
      },
    );
    lastStatus = String(response.status);
    if (response.ok) process.exit(0);
    if (response.status !== 404 && response.status !== 503) break;
  } catch (error) {
    lastStatus = error instanceof Error ? error.message : "unknown error";
  }
  await wait();
}

throw new Error(`Local Supabase Data API did not become ready: ${lastStatus}`);
