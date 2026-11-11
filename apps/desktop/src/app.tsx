import 'src/global.css';
import 'src/locales/i18n';

import { useEffect } from 'react';

import { usePathname } from 'src/routes/hooks';

import { ThemeProvider } from 'src/theme/theme-provider';

// ----------------------------------------------------------------------

type AppProps = {
  children: React.ReactNode;
};

export default function App({ children }: AppProps) {
  useScrollToTop();

  return <ThemeProvider>{children}</ThemeProvider>;
}

// ----------------------------------------------------------------------

function useScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('[class*="layout__main"]')?.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
