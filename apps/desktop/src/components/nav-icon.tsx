// Íconos de contorno (#o-*) e íconos bitono (#i-*) fieles a design/mockup.html.

const NAV_PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z',
  cards:
    'M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM7 9h10M7 13h10M7 17h5',
  pr: 'M6 8.5v7M18 15.5V10a3 3 0 0 0-3-3h-3m0 0 2.5-2.5M12 7l2.5 2.5M8.5 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM8.5 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM20.5 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  settings:
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  folderPlus:
    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM12 10v6M9 13h6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  search: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm2 9-3.5-3.5',
  chev: 'm6 9 6 6 6-6',
  filter: 'M4 6h16M7 12h10M10 18h4',
  branch:
    'M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM6 7v10M18 9c0 4-6 4-11 8',
  bug: 'M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0V9ZM12 9v9M4 13h4M16 13h4M5 7l3 2M19 7l-3 2M5 19l3-2M19 19l-3-2',
} as const;

export type NavIconName = keyof typeof NAV_PATHS;

export function NavIcon({ name, size = 19 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={NAV_PATHS[name]} />
    </svg>
  );
}

// ----------------------------------------------------------------------

export type AppIconName =
  | 'bug'
  | 'task'
  | 'idea'
  | 'auto'
  | 'cards'
  | 'search'
  | 'code'
  | 'git'
  | 'chat'
  | 'term'
  | 'doc'
  | 'plus'
  | 'copy'
  | 'vscode'
  | 'play'
  | 'lock'
  | 'table'
  | 'kanban'
  | 'export'
  | 'sparkle'
  | 'gh'
  | 'pr'
  | 'issue';

export function AppIcon({ name, size = 20 }: { name: AppIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      {name === 'bug' && (
        <>
          <path fill="currentColor" opacity=".32" d="M6 11a6 6 0 0 1 12 0v4a6 6 0 0 1-12 0v-4Z" />
          <path
            fill="currentColor"
            d="M9 4.5 7.8 3.2a.75.75 0 1 1 1.1-1L10.2 3.6a6 6 0 0 1 3.6 0l1.3-1.4a.75.75 0 1 1 1.1 1L15 4.5A6 6 0 0 1 17.6 8H6.4A6 6 0 0 1 9 4.5ZM2.25 13c0-.41.34-.75.75-.75h3v1.5H3a.75.75 0 0 1-.75-.75Zm15.75-.75h3a.75.75 0 0 1 0 1.5h-3v-1.5ZM11.25 11v9a.75.75 0 0 0 1.5 0v-9a.75.75 0 0 0-1.5 0Z"
          />
        </>
      )}
      {name === 'task' && (
        <>
          <path
            fill="currentColor"
            opacity=".32"
            d="M3.17 3.17C2 4.34 2 6.23 2 10v4c0 3.77 0 5.66 1.17 6.83C4.34 22 6.23 22 10 22h4c3.77 0 5.66 0 6.83-1.17C22 19.66 22 17.77 22 14v-4c0-3.77 0-5.66-1.17-6.83C19.66 2 17.77 2 14 2h-4C6.23 2 4.34 2 3.17 3.17Z"
          />
          <path
            fill="currentColor"
            d="M16.03 9.03a.75.75 0 0 0-1.06-1.06L10.5 12.44l-1.47-1.47a.75.75 0 0 0-1.06 1.06l2 2c.3.3.77.3 1.06 0l5-5Z"
          />
        </>
      )}
      {name === 'idea' && (
        <>
          <path
            fill="currentColor"
            opacity=".32"
            d="M12 2a7 7 0 0 0-4 12.74V16a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1.26A7 7 0 0 0 12 2Z"
          />
          <path
            fill="currentColor"
            d="M9.25 20.5c0-.41.34-.75.75-.75h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75Zm3.31-14.72a.75.75 0 0 0-1.12-.06l-3 3.25a.75.75 0 0 0 .56 1.25h2.06l-1.44 2.57a.75.75 0 1 0 1.3.74l2.06-3.66A.75.75 0 0 0 12.33 8.75h-1.04l1.27-1.38c.28-.3.27-.78 0-1.08Z"
          />
        </>
      )}
      {name === 'auto' && (
        <>
          <path
            fill="currentColor"
            opacity=".32"
            d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10Z"
          />
          <path
            fill="currentColor"
            d="M16.03 8.97c.3.3.3.77 0 1.06l-5 5a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l1.47 1.47 4.47-4.47c.3-.3.77-.3 1.06 0Z"
          />
        </>
      )}
      {name === 'cards' && (
        <>
          <path
            fill="currentColor"
            opacity=".32"
            d="M3 7c0-2.2 1.8-4 4-4h10c2.2 0 4 1.8 4 4v10c0 2.2-1.8 4-4 4H7c-2.2 0-4-1.8-4-4V7Z"
          />
          <path
            fill="currentColor"
            d="M7 8.25h10a.75.75 0 0 0 0-1.5H7a.75.75 0 0 0 0 1.5Zm0 4.5h10a.75.75 0 0 0 0-1.5H7a.75.75 0 0 0 0 1.5Zm0 4.5h6a.75.75 0 0 0 0-1.5H7a.75.75 0 0 0 0 1.5Z"
          />
        </>
      )}
      {name === 'search' && (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          d="m20 20-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        />
      )}
      {name === 'code' && (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"
        />
      )}
      {name === 'git' && (
        <>
          <circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
          <circle cx="6" cy="18" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
          <circle cx="18" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            d="M6 8.5v7M18 10.5c0 4-6 3-10.5 6"
          />
        </>
      )}
      {name === 'chat' && (
        <>
          <path
            fill="currentColor"
            opacity=".32"
            d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12c0 1.6.38 3.11 1.04 4.45.18.35.24.76.13 1.15l-.6 2.23a1.3 1.3 0 0 0 1.6 1.6l2.23-.6c.39-.11.8-.05 1.15.13A9.96 9.96 0 0 0 12 22Z"
          />
          <path
            fill="currentColor"
            d="M7.25 10.5c0-.41.34-.75.75-.75h8a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75Zm0 3.5c0-.41.34-.75.75-.75h5.5a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75Z"
          />
        </>
      )}
      {name === 'term' && (
        <>
          <rect
            x="2.5"
            y="4"
            width="19"
            height="16"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m7 9.5 2.5 2.5L7 14.5M12 15h5"
          />
        </>
      )}
      {name === 'doc' && (
        <>
          <path
            fill="currentColor"
            opacity=".32"
            d="M4 7c0-2.83 0-4.24.88-5.12C5.76 1 7.17 1 10 1h4c2.83 0 4.24 0 5.12.88C20 2.76 20 4.17 20 7v10c0 2.83 0 4.24-.88 5.12-.88.88-2.29.88-5.12.88h-4c-2.83 0-4.24 0-5.12-.88C4 21.24 4 19.83 4 17V7Z"
          />
          <path
            fill="currentColor"
            d="M8 7.25a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5H8Zm0 4a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5H8Zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H8Z"
          />
        </>
      )}
      {name === 'plus' && (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          d="M12 5v14M5 12h14"
        />
      )}
      {name === 'copy' && (
        <>
          <path
            fill="currentColor"
            opacity=".32"
            d="M6.6 11.4c0-2.83 0-4.24.88-5.12.88-.88 2.3-.88 5.12-.88h3c2.83 0 4.24 0 5.12.88.88.88.88 2.3.88 5.12v5c0 2.83 0 4.24-.88 5.12-.88.88-2.29.88-5.12.88h-3c-2.83 0-4.24 0-5.12-.88-.88-.88-.88-2.29-.88-5.12v-5Z"
          />
          <path
            fill="currentColor"
            d="M4.17 3.17C3 4.34 3 6.23 3 10v2c0 3.13 0 4.95.67 6.16-.07-.6-.07-1.44-.07-2.76v-5c0-3.2 0-4.8.98-5.83C5.6 3.6 7.2 3.6 10.4 3.6h3c1.32 0 2.16 0 2.76.07C14.95 3 13.13 3 10 3H8.6c-2.4 0-3.75.03-4.43.17Z"
          />
        </>
      )}
      {name === 'vscode' && (
        <path
          fill="currentColor"
          d="M17.6 2.3 9.7 9.5 4.9 5.9 3 6.8v10.4l1.9.9 4.8-3.6 7.9 7.2L21 20.3V3.7l-3.4-1.4ZM5 14.6V9.4l2.6 2.6L5 14.6Zm12.6 1.6L12.7 12l4.9-4.2v8.4Z"
        />
      )}
      {name === 'play' && (
        <path
          fill="currentColor"
          d="M7 5.2v13.6c0 .9 1 1.5 1.8 1l10.4-6.8a1.2 1.2 0 0 0 0-2L8.8 4.2C8 3.7 7 4.3 7 5.2Z"
        />
      )}
      {name === 'lock' && (
        <path
          fill="currentColor"
          d="M12 2a5 5 0 0 0-5 5v2.1A3 3 0 0 0 5 12v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6a3 3 0 0 0-2-2.9V7a5 5 0 0 0-5-5Zm3 7H9V7a3 3 0 1 1 6 0v2Z"
        />
      )}
      {name === 'table' && (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13ZM3 9h18M3 15h18M9 9v12"
        />
      )}
      {name === 'kanban' && (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          d="M5 4v10M12 4v16M19 4v7"
        />
      )}
      {name === 'export' && (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15V3m0 0L8 7m4-4 4 4M4 14v3a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-3"
        />
      )}
      {name === 'sparkle' && (
        <path
          fill="currentColor"
          d="M12 2c.4 3.9 2.1 5.6 6 6-3.9.4-5.6 2.1-6 6-.4-3.9-2.1-5.6-6-6 3.9-.4 5.6-2.1 6-6Zm6 11c.25 2.2 1.3 3.25 3.5 3.5-2.2.25-3.25 1.3-3.5 3.5-.25-2.2-1.3-3.25-3.5-3.5 2.2-.25 3.25-1.3 3.5-3.5Z"
        />
      )}
      {name === 'gh' && (
        <path
          fill="currentColor"
          d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
        />
      )}
      {name === 'pr' && (
        <>
          <circle cx="6" cy="5.5" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
          <circle cx="6" cy="18.5" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
          <circle cx="18" cy="18.5" r="2.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 8v8M18 16V9.5a3 3 0 0 0-3-3h-4m0 0 2.5-2.5M11 6.5 13.5 9"
          />
        </>
      )}
      {name === 'issue' && (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={1.8} />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
