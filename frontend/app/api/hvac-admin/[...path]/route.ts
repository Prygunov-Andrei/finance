import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ERP_API_URL = (process.env.BACKEND_API_URL || 'http://backend:8000').replace(/\/$/, '');

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'authorization',
  'x-requested-with',
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
  const search = request.nextUrl.search || '';
  const [prefix, ...rest] = path;
  const normalizedPath = rest.join('/');

  if (prefix === 'api' && rest[0] === 'hvac') {
    const publicPath = rest.slice(1).join('/');
    return `${ERP_API_URL}/api/v1/hvac/public/${publicPath}/${search}`;
  }

  if (prefix === 'hvac-admin') {
    return `${ERP_API_URL}/api/v1/hvac/admin/${normalizedPath}/${search}`;
  }

  return `${ERP_API_URL}/api/v1/hvac/public/${normalizedPath}/${search}`;
};

const proxyRequest = async (
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) => {
  if (!request.headers.get('authorization')) {
    return NextResponse.json({ detail: 'ERP authorization is required.' }, { status: 401 });
  }

  const resolvedParams = await context.params;
  const upstreamUrl = buildUpstreamUrl(request, resolvedParams.path);
  const headers = buildForwardHeaders(request);

  let body: BodyInit | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');

  if (contentType) {
    responseHeaders.set('content-type', contentType);
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
