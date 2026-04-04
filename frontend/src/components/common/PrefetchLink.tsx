import { useCallback, type ReactNode, type MouseEvent, type FocusEvent } from 'react';
import { NavLink, Link, type NavLinkProps, type LinkProps } from 'react-router-dom';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

interface PrefetchConfig {
  queryKey: QueryKey;
  url: string;
  staleTime?: number;
}

interface PrefetchNavLinkProps extends NavLinkProps {
  prefetch?: PrefetchConfig;
}

interface PrefetchLinkProps extends LinkProps {
  prefetch?: PrefetchConfig;
  children: ReactNode;
}

function usePrefetchOnHover(prefetch?: PrefetchConfig) {
  const queryClient = useQueryClient();

  const handlePrefetch = useCallback(() => {
    if (!prefetch) return;
    queryClient.prefetchQuery({
      queryKey: prefetch.queryKey,
      queryFn: async () => {
        const res = await apiFetch(prefetch.url);
        if (!res.ok) throw new Error('Prefetch failed');
        return res.json();
      },
      staleTime: prefetch.staleTime ?? 5 * 60 * 1000,
    });
  }, [queryClient, prefetch]);

  return handlePrefetch;
}

export function PrefetchNavLink({ prefetch, onMouseEnter, onFocus, ...props }: PrefetchNavLinkProps) {
  const handlePrefetch = usePrefetchOnHover(prefetch);

  const handleMouseEnter = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      handlePrefetch();
      onMouseEnter?.(e);
    },
    [handlePrefetch, onMouseEnter],
  );

  const handleFocus = useCallback(
    (e: FocusEvent<HTMLAnchorElement>) => {
      handlePrefetch();
      onFocus?.(e);
    },
    [handlePrefetch, onFocus],
  );

  return <NavLink {...props} onMouseEnter={handleMouseEnter} onFocus={handleFocus} />;
}

export function PrefetchLink({ prefetch, onMouseEnter, onFocus, children, ...props }: PrefetchLinkProps) {
  const handlePrefetch = usePrefetchOnHover(prefetch);

  const handleMouseEnter = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      handlePrefetch();
      onMouseEnter?.(e);
    },
    [handlePrefetch, onMouseEnter],
  );

  const handleFocus = useCallback(
    (e: FocusEvent<HTMLAnchorElement>) => {
      handlePrefetch();
      onFocus?.(e);
    },
    [handlePrefetch, onFocus],
  );

  return (
    <Link {...props} onMouseEnter={handleMouseEnter} onFocus={handleFocus}>
      {children}
    </Link>
  );
}
