import { CONFIG } from 'src/config-global';

import { SummaryView } from 'src/sections/summary/summary-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <title>{CONFIG.appName}</title>
      <SummaryView />
    </>
  );
}
