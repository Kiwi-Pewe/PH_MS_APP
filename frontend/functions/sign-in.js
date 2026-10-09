export async function onRequest(context) {
  const url = new URL("/login", context.request.url);
  const response = await context.env.ASSETS.fetch(url);
  const headers = new Headers(response.headers);
  headers.delete("Location");
  return new Response(response.body, { status: 200, headers });
}
