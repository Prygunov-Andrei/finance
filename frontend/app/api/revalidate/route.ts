import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: 'REVALIDATE_SECRET not configured' },
      { status: 500 },
    );
  }

  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get('path') || '/';
  revalidatePath(path);

  return NextResponse.json({
    revalidated: true,
    path,
    at: new Date().toISOString(),
  });
}
