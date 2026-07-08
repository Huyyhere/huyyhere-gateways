export function parseRetryAfterMs(text: string): number | undefined {
  const combined = text.match(/(\d+)\s*m(?:in)?\s*(\d+(?:\.\d+)?)\s*s/i);
  if (combined) {
    const minutes = Number(combined[1]);
    const seconds = Number(combined[2]);
    return Math.ceil((minutes * 60 + seconds) * 1000);
  }

  const secOnly = text.match(/(?:try again in|retry in|wait)\s*(\d+(?:\.\d+)?)\s*s/i);
  if (secOnly) return Math.ceil(Number(secOnly[1]) * 1000);

  return undefined;
}
