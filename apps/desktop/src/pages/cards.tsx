import { CONFIG } from 'src/config-global';

import { PlaceholderView } from 'src/sections/placeholder/placeholder-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <title>{CONFIG.appName}</title>
      <PlaceholderView section="cards" />
    </>
  );
}
