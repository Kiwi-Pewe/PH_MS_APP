import { servePath } from "./_shared.js";

const KEEP = new Set(["login", "invite", "index", "admin", "main", "shared", "steam", "accessibility"]);

export function onRequest(context) {
  const slug = String(context.params.slug || "");
  if (!slug || slug.includes(".") || KEEP.has(slug.toLowerCase())) return context.next();
  return servePath(context, "/main/app");
}
