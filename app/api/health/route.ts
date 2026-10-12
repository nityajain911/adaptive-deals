/** For the host's health check: answers without touching any deal state. */
export function GET() {
  return Response.json({ ok: true });
}
