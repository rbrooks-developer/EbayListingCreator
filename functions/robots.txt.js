export async function onRequest() {
  const content = [
    'User-agent: *',
    'Allow: /',
    '',
    'Sitemap: https://createmylistings.com/sitemap.xml',
    '',
  ].join('\n');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
