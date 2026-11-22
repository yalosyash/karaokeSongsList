export function isEmbedBlocked(result) {
  return result.status === "error" && [101, 150].includes(result.error);
}

function isConclusive(result) {
  return result.status === "ok" || isEmbedBlocked(result);
}

export function mergeEmbedResults(previous, results) {
  const merged = new Map(previous.map((result) => [result.id, result]));
  for (const result of results) {
    const saved = merged.get(result.id);
    if (saved && isConclusive(saved) && !isConclusive(result)) continue;
    merged.set(result.id, result);
  }
  return [...merged.values()];
}
