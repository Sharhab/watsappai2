export function toAbsoluteUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = process.env.PUBLIC_BASE_URL || "";
  return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}
