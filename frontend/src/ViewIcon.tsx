import type { ViewId } from './views';

// Line icons drawn on a 24-unit grid, so phones can show every tab at once with only a short label.
const PATHS: Record<ViewId, string> = {
  breath:
    'M12 3v8m0 0-3 2.5m3-2.5 3 2.5M9.5 7C6 8 3.5 13 3.5 17.5c0 2 1.6 3 3.5 2.2l2.5-1V9M14.5 7c3.5 1 6 6 6 10.5 0 2-1.6 3-3.5 2.2l-2.5-1V9',
  landscape: 'M3 19 8 11l4 4 3.5-6L21 19z',
  calendar: 'M4 6.5h16v13H4zM4 10.5h16M8.5 4v4M15.5 4v4M8 14h2m3 0h2m-7 3h2',
  'size-mix': 'M3 18c3-2 6 0 9-1.5S18 14 21 15M3 13.5c3-2 6 0 9-2s6-1 9-.5M3 9c3-2 6 0 9-2.5s6-.5 9 0',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
};

export function ViewIcon({ view }: { view: ViewId }) {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[view]} />
    </svg>
  );
}
