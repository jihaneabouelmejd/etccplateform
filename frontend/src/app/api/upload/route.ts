/**
 * Next.js App Router — Upload proxy
 *
 * Next.js rewrites can corrupt the multipart/form-data boundary when proxying
 * file uploads to the NestJS backend. This dedicated route.ts bypasses the
 * rewrite and forwards the raw FormData directly, which fixes the "Erreur lors
 * du téléversement du fichier" error.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL
  ? `${process.env.BACKEND_URL}/api/upload`
  : 'http://localhost:4000/api/upload';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') ?? '';

    // Parse the incoming multipart body
    const formData = await request.formData();

    // Forward to NestJS — fetch re-serialises FormData with a fresh, valid boundary
    const backendRes = await fetch(BACKEND, {
      method: 'POST',
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: formData,
    });

    let data: unknown;
    const contentType = backendRes.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = await backendRes.json();
    } else {
      data = { message: await backendRes.text() };
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    console.error('[Upload proxy] Error:', err?.message ?? err);
    return NextResponse.json(
      { message: 'Impossible de contacter le serveur de téléversement' },
      { status: 502 },
    );
  }
}
