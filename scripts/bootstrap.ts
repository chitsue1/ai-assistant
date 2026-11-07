// Runs on every server start (see railway.json): creates or updates tables, and loads the demo company
// the first time only, so a live database is never overwritten.
import "./_env";
import { execSync } from "node:child_process";
import { pool, q } from "../lib/db";

async function main() {
  execSync("tsx scripts/migrate.ts", { stdio: "inherit" });
  const [{ n }] = await q<{ n: string }>("SELECT count(*) AS n FROM tenants");
  await pool.end();
  if (Number(n) === 0) {
    console.log("empty database: loading demo company");
    execSync("tsx scripts/ingest.ts data/demo", { stdio: "inherit" });
  } else {
    console.log(`database has ${n} companies, skipping demo load`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
