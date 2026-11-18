export function videoId(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Нужна ссылка YouTube");
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let id;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id || ""))
    throw new Error("Не удалось прочитать ссылку на видео YouTube");
  return id;
}

export function songName(title) {
  const clean = title
    .replace(/\s*[([][^\])]*(?:karaoke|караоке)[^\])]*[)\]]/gi, "")
    .trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  return parts.length === 2
    ? { artist: parts[0], title: parts[1] }
    : { artist: "", title: clean };
}
