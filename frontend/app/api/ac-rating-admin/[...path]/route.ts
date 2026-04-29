import { NextRequest, NextResponse } from 'next/server';

// BFF proxy для админского API рейтинга кондиционеров.
// Бэкенд: `/api/hvac/rating/...` (см. backend/finans_assistant/urls.py).
// Существующий /api/hvac-admin proxy жёстко мапит на /api/v1/hvac/{public,admin},
// поэтому для AC Rating заведён отдельный slim-proxy.

export const dynamic = 'force-dynamic';

const ERP_API_URL = (process.env.BACKEND_API_URL || 'http://backend:8000').replace(/\/$/, '');

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'x-requested-with',
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'cache-control',
  'etag',
  'last-modified',
  'location',
] as const;

const buildForwardHeaders = (request: NextRequest): Headers => {
  const headers = new Headers();

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const headerValue = request.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }
  if (!headers.has('accept-language')) {
    headers.set('accept-language', 'ru');
  }
  return headers;
};

const buildUpstreamUrl = (request: NextRequest, path: string[]): string => {
  const normalizedPath = path.join('/');
  const search = request.nextUrl.search || '';
  return `${ERP_API_URL}/api/hvac/rating/${normalizedPath}/${search}`;
};

const proxyRequest = async (
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) => {
  if (!request.headers.get('authorization')) {
    return NextResponse.json(
      { detail: 'ERP authorization is required.' },
      { status: 401 }
    );
  }

  const resolvedParams = await context.params;
  const upstreamUrl = buildUpstreamUrl(request, resolvedParams.path);

  let body: BodyInit | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: buildForwardHeaders(request),
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  for (const headerName of FORWARDED_RESPONSE_HEADERS) {
    const headerValue = upstreamResponse.headers.get(headerName);
    if (headerValue) {
      responseHeaders.set(headerName, headerValue);
    }
  }

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
};

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
