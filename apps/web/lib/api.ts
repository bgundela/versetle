import { NextResponse } from 'next/server';
import { ProviderError } from '@versetle/lyrics-provider';
import { ZodError } from 'zod';
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: 'Check your song selection and game settings.' },
      { status: 400 },
    );
  const status = error instanceof ProviderError ? error.status : 422;
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Unable to prepare this puzzle.',
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(error instanceof ProviderError && error.retryAfter
          ? { 'Retry-After': String(error.retryAfter) }
          : {}),
      },
    },
  );
}
