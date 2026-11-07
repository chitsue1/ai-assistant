// USD per million tokens for Claude Haiku 5.5, prompts up to 100K tokens (Anthropic pricing, Oct 2026).
// Our prompts stay far below 100K. Check the official pricing page if these ever change.
export const PRICE_PER_MTOK = {
  input: 0.1,
  output: 0.5,
  cacheRead: 0.01,
  cacheWrite: 0.125,
};

export function costUsd(u: { input: number; output: number; cacheRead: number; cacheWrite: number }) {
  return (
    (u.input * PRICE_PER_MTOK.input +
      u.output * PRICE_PER_MTOK.output +
      u.cacheRead * PRICE_PER_MTOK.cacheRead +
      u.cacheWrite * PRICE_PER_MTOK.cacheWrite) /
    1_000_000
  );
}
