// Load .env for local scripts. On a server the variables are already set, so a missing file is fine.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file */
}
