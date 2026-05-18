/**
 * Next.js App Router — Catch-all API proxy
 *
 * Next.js `rewrites()` can silently drop or corrupt request bodies on POST/PATCH/PUT,
 * causing the NestJS backend to receive empty data and Prisma to throw errors.
 * This route bypasses rewrites entirely and forwards every request — including its
 * body — directly to the backend.
 *
 * Upload requests are handled by /api/upload/route.ts and are NOT intercepted here.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const pathStr = path.join('/');

    // Build the target URL, preserving query string
    const targetUrl = `${BACKEND}/api/${pathStr}${req.nextUrl.search}`;

    const isBodyless = req.method === 'GET' || req.method === 'HEAD';

    // Forward request body as raw text so nothing is lost
    const body = isBodyless ? undefined : await req.text();

    // Forward essential headers
    const headers: Record<string, string> = {};
    const contentType = req.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;
    const auth = req.headers.get('authorization');
    if (auth) headers['authorization'] = auth;
    const cookie = req.headers.get('cookie');
    if (cookie) headers['cookie'] = cookie;

    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const resContentType = backendRes.headers.get('content-type') ?? 'application/json';
    const resBody = await backendRes.text();

    const resHeaders = new Headers({ 'content-type': resContentType });

    // Forward Set-Cookie so the browser receives the refresh-token cookie from the backend
    const setCookie = backendRes.headers.get('set-cookie');
    if (setCookie) resHeaders.set('set-cookie', setCookie);

    // Forward other useful headers
    const location = backendRes.headers.get('location');
    if (location) resHeaders.set('location', location);

    return new NextResponse(resBody, {
      status: backendRes.status,
      headers: resHeaders,
    });
  } catch (err: any) {
    console.error('[API proxy] Error:', err?.message ?? err);
    return NextResponse.json(
      { message: 'Impossible de contacter le serveur backend', error: err?.message },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
