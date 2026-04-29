import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ERP_API_URL = (process.env.BACKEND_API_URL || 'http://backend:8000').replace(/\/$/, '');

const buildForwardHeaders = (request: NextRequest): Headers => {
  const headers = new Headers();

  const accept = request.headers.get('accept');
  const acceptLanguage = request.headers.get('accept-language');

  headers.set('accept', accept || 'application/json');

  if (acceptLanguage) {
    headers.set('accept-language', acceptLanguage);
  }

  return headers;
};

const buildUpstreamUrl = (request: NextRequest, path: string[]): string => {
  const normalizedPath = path.join('/');
  const search = request.nextUrl.search || '';

  return `${ERP_API_URL}/api/v1/hvac/public/${normalizedPath}/${search}`;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await context.params;
  const upstreamUrl = buildUpstreamUrl(request, resolvedParams.path);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: 'GET',
    headers: buildForwardHeaders(request),
    cache: 'no-store',
    redirect: 'follow',
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
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await context.params;
  const upstreamUrl = buildUpstreamUrl(request, resolvedParams.path);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: 'HEAD',
    headers: buildForwardHeaders(request),
    cache: 'no-store',
    redirect: 'follow',
  });

  return new NextResponse(null, {
    status: upstreamResponse.status,
  });
}
