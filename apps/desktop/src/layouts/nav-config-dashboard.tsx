import { NavIcon } from 'src/components/nav-icon';

// ----------------------------------------------------------------------

export type NavItem = {
  /** Clave de traducción del título (ver src/locales). */
  titleKey: string;
  path: string;
  icon: React.ReactNode;
  info?: React.ReactNode;
};

export const navData: NavItem[] = [
  { titleKey: 'nav.summary', path: '/', icon: <NavIcon name="home" /> },
  { titleKey: 'nav.cards', path: '/cards', icon: <NavIcon name="cards" /> },
  { titleKey: 'nav.pullRequests', path: '/pull-requests', icon: <NavIcon name="pr" /> },
];
