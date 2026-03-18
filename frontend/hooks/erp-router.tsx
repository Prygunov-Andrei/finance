'use client';

/**
 * Compatibility shim: wraps next/navigation hooks to match react-router v6 API.
 * Allows gradual migration of ERP components from react-router SPA to Next.js App Router.
 *
 * All ERP routes live under /erp prefix — navigate('/dashboard') → /erp/dashboard.
 */

import {
  useRouter,
  usePathname,
  useSearchParams as useNextSearchParams,
  useParams as useNextParams,
} from 'next/navigation';
import NextLink from 'next/link';
import { forwardRef, type ComponentProps } from 'react';

export { useNextParams as useParams };

/** Drop-in replacement for react-router <Link to="..."> */
export const Link = forwardRef<
  HTMLAnchorElement,
  Omit<ComponentProps<typeof NextLink>, 'href'> & { to: string }
>(function Link({ to, ...props }, ref) {
  const href = to.startsWith(ERP_PREFIX) || to.startsWith('http') ? to : `${ERP_PREFIX}${to}`;
  return <NextLink ref={ref} href={href} {...props} />;
});

const ERP_PREFIX = '/erp';

function toERPPath(to: string): string {
  if (to.startsWith(ERP_PREFIX) || to.startsWith('http')) return to;
  return `${ERP_PREFIX}${to}`;
}

/** Drop-in replacement for react-router useNavigate */
export function useNavigate() {
  const router = useRouter();

  return (
    to: string | number,
    options?: { replace?: boolean; state?: unknown }
  ) => {
    if (typeof to === 'number') {
      window.history.go(to);
      return;
    }
    const url = toERPPath(to);
    if (options?.replace) {
      router.replace(url);
    } else {
      router.push(url);
    }
  };
}

/** Drop-in replacement for react-router useLocation */
export function useLocation() {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

  return {
    // Strip /erp prefix so existing code can compare against '/dashboard' etc.
    pathname: pathname.startsWith(ERP_PREFIX)
      ? pathname.slice(ERP_PREFIX.length) || '/'
      : pathname,
    search,
    hash: '',
    state: null,
    key: 'default',
  };
}

type SetSearchParams = (
  params: Record<string, string> | URLSearchParams,
  options?: { replace?: boolean }
) => void;

/** Drop-in replacement for react-router useSearchParams — returns [params, setter] tuple */
export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const nextSearchParams = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const searchParams = new URLSearchParams(nextSearchParams?.toString() ?? '');

  const setSearchParams: SetSearchParams = (params, options) => {
    const newParams =
      params instanceof URLSearchParams
        ? params
        : new URLSearchParams(params as Record<string, string>);
    const qs = newParams.toString();
    const newUrl = `${pathname}${qs ? `?${qs}` : ''}`;
    if (options?.replace !== false) {
      router.replace(newUrl);
    } else {
      router.push(newUrl);
    }
  };

  return [searchParams, setSearchParams];
}
