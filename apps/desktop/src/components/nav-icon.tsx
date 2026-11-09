// Íconos de la app: Lucide (ISC), de línea y monocromos. Los logos de marca
// (GitHub, VS Code) no están en Lucide y se dibujan aparte.
//
// Cada ícono lleva ancho y alto fijos para que no cambie de tamaño mientras cargan
// los estilos al abrir la app.

import type { LucideIcon } from 'lucide-react';

import {
  X,
  Bug,
  Copy,
  Code,
  Play,
  Bell,
  Lock,
  Menu,
  Plug,
  Plus,
  User,
  Check,
  House,
  Inbox,
  Table2,
  Search,
  Upload,
  Folder,
  LogOut,
  FileText,
  Settings,
  Keyboard,
  Columns3,
  ListTodo,
  Sparkles,
  LifeBuoy,
  RefreshCw,
  PanelLeft,
  GitBranch,
  Lightbulb,
  CircleDot,
  FolderPlus,
  ListFilter,
  LayoutList,
  CircleCheck,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  SquareTerminal,
  GitPullRequest,
  GitCommitHorizontal,
} from 'lucide-react';

// ----------------------------------------------------------------------

const ICONS = {
  // Navegación
  home: House,
  cards: LayoutList,
  pr: GitPullRequest,
  settings: Settings,
  folder: Folder,
  folderPlus: FolderPlus,
  bell: Bell,
  inbox: Inbox,
  search: Search,
  chev: ChevronDown,
  chevRight: ChevronRight,
  filter: ListFilter,
  branch: GitBranch,
  panel: PanelLeft,
  plug: Plug,
  keyboard: Keyboard,
  refresh: RefreshCw,
  help: LifeBuoy,
  logout: LogOut,
  user: User,
  // Tarjetas y orígenes
  bug: Bug,
  task: ListTodo,
  idea: Lightbulb,
  auto: CircleCheck,
  code: Code,
  git: GitCommitHorizontal,
  chat: MessageSquare,
  term: SquareTerminal,
  doc: FileText,
  plus: Plus,
  copy: Copy,
  play: Play,
  lock: Lock,
  table: Table2,
  kanban: Columns3,
  export: Upload,
  sparkle: Sparkles,
  issue: CircleDot,
  menu: Menu,
  x: X,
  check: Check,
} satisfies Record<string, LucideIcon>;

type LucideName = keyof typeof ICONS;
type BrandName = 'gh' | 'vscode';

export type AppIconName = LucideName | BrandName;
export type NavIconName = AppIconName;

type IconProps = { name: AppIconName; size?: number; strokeWidth?: number };

export function AppIcon({ name, size = 20, strokeWidth = 1.75 }: IconProps) {
  const style = { width: size, height: size, flexShrink: 0 } as const;

  if (name === 'gh' || name === 'vscode') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden>
        <path fill="currentColor" d={BRAND_PATHS[name]} />
      </svg>
    );
  }

  const Icon = ICONS[name];
  return (
    <Icon
      size={size}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      style={style}
      aria-hidden
    />
  );
}

/** Ícono de la barra lateral: igual que `AppIcon`, con el tamaño de la navegación. */
export function NavIcon({ name, size = 19, strokeWidth }: IconProps) {
  return <AppIcon name={name} size={size} strokeWidth={strokeWidth} />;
}

const BRAND_PATHS: Record<BrandName, string> = {
  gh: 'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z',
  vscode:
    'M17.6 2.3 9.7 9.5 4.9 5.9 3 6.8v10.4l1.9.9 4.8-3.6 7.9 7.2L21 20.3V3.7l-3.4-1.4ZM5 14.6V9.4l2.6 2.6L5 14.6Zm12.6 1.6L12.7 12l4.9-4.2v8.4Z',
};
