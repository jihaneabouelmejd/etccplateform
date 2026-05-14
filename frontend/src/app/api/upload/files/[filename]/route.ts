/**
 * Next.js proxy — sert les fichiers uploadés en local (fallback si Cloudinary est absent).
 * Route: GET /api/upload/files/:filename
 * Proxifie vers le backend NestJS : GET /api/upload/files/:filename
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/api$/, '');

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } },
) {
  const { filename } = params;
  if (!filename) {
    return NextResponse.json({ message: 'Nom de fichier manquant' }, { status: 400 });
  }

  const backendUrl = `${BACKEND_BASE}/api/upload/files/${encodeURIComponent(filename)}`;

  try {
    const res = await fetch(backendUrl, { cache: 'no-store' });

    if (!res.ok) {
      return NextResponse.json(
        { message: `Fichier introuvable (backend: ${res.status})` },
        { status: res.status },
      );
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    console.error('[Upload proxy GET] Error:', err?.message);
    return NextResponse.json(
      { message: 'Impossible de récupérer le fichier depuis le backend' },
      { status: 502 },
    );
  }
}
