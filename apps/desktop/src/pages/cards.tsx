import { CONFIG } from 'src/config-global';

import { CardsView } from 'src/sections/cards/cards-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <title>{CONFIG.appName}</title>
      <CardsView />
    </>
  );
}
