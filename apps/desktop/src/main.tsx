import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Outlet, RouterProvider, createBrowserRouter } from 'react-router';

import App from './app';
import { routesSection } from './routes/sections';
import { ErrorBoundary } from './routes/components';

// ----------------------------------------------------------------------

const router = createBrowserRouter([
  {
    Component: () => (
      <App>
        <Outlet />
      </App>
    ),
    errorElement: <ErrorBoundary />,
    children: routesSection,
  },
]);

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// Es una app de escritorio: sin el menú del navegador (Atrás, Recargar, Imprimir…).
// En campos de texto se deja, para copiar y pegar.
window.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('input, textarea, [contenteditable="true"]')) {
    event.preventDefault();
  }
});

// Fuera de desarrollo, F5 y Ctrl+R no recargan la app ni Ctrl+P la imprime.
if (!import.meta.env.DEV) {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'f5' || (event.ctrlKey && (key === 'r' || key === 'p'))) {
      event.preventDefault();
    }
  });
}

// La ventana nace oculta (tauri.conf.json) para no enseñar un primer pintado a medias.
// Se muestra tras dos fotogramas, cuando el diseño ya está en su sitio.
if ('__TAURI_INTERNALS__' in window) {
  requestAnimationFrame(() =>
    requestAnimationFrame(async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      if (await invoke<boolean>('is_background_start')) return;
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().show();
    })
  );
}
