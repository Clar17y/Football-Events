import { useEffect, useRef } from 'react';
import type { HTMLIonContentElement } from '@ionic/core/components';

interface Options {
  param: string; // query param name, e.g., 'matchId'
  itemAttr: string; // attribute name on target element, e.g., 'data-match-id'
  listSelector?: string; // optional container to scope the query
  contentRef: React.RefObject<HTMLIonContentElement | null>;
  ready: boolean; // when data and DOM are ready
  offset?: number; // scroll offset from top, default 80
  highlightClass?: string; // class to apply for flash, default 'highlight-flash'
  durationMs?: number; // duration to keep highlight, default 1500ms
}

export function useDeepLinkScrollHighlight({
  param,
  itemAttr,
  listSelector,
  contentRef,
  ready,
  offset = 80,
  highlightClass = 'highlight-flash',
  durationMs = 1500,
}: Options) {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get(param);
    if (!id) return;
    if (handledRef.current === id) return;

    // Build a robust selector. If listSelector contains comma-separated lists,
    // ensure the attribute is applied to each list item, not just the last.
    let selector: string;
    if (listSelector && listSelector.includes(',')) {
      selector = listSelector
        .split(',')
        .map(s => `${s.trim()} [${itemAttr}="${CSS.escape(id)}"]`)
        .join(', ');
    } else if (listSelector) {
      selector = `${listSelector.trim()} [${itemAttr}="${CSS.escape(id)}"]`;
    } else {
      selector = `[${itemAttr}="${CSS.escape(id)}"]`;
    }
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target) return;

    handledRef.current = id;

    (async () => {
      try {
        const ion = contentRef.current as any;
        const getScrollElement = ion?.getScrollElement?.bind(ion);
        const scrollEl: HTMLElement | null = getScrollElement ? await getScrollElement() : null;
        if (scrollEl) {
          const rect = target.getBoundingClientRect();
          const srect = scrollEl.getBoundingClientRect();
          const top = rect.top - srect.top + scrollEl.scrollTop - offset;
          scrollEl.scrollTo({ top, behavior: 'smooth' });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } finally {
        target.classList.add(highlightClass);
        setTimeout(() => target.classList.remove(highlightClass), durationMs);
        setTimeout(() => target.focus?.(), 120);
      }
    })();

    // Remove only this param from URL (keep others intact)
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(param);
      const qs = url.searchParams.toString();
      window.history.replaceState({}, '', url.pathname + (qs ? `?${qs}` : ''));
    } catch {
      // no-op
    }
  }, [ready, param, itemAttr, listSelector, contentRef, offset, highlightClass, durationMs]);
}

export default useDeepLinkScrollHighlight;
