export async function servePath(context, pathname) {
  const url = new URL(pathname, context.request.url);
  let response = await context.env.ASSETS.fetch(url);
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location");
    if (location) response = await context.env.ASSETS.fetch(new URL(location, url));
  }
  const headers = new Headers(response.headers);
  headers.delete("Location");
  return new Response(response.body, { status: 200, headers });
}
