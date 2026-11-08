import { CONFIG } from 'src/config-global';

import { PullRequestsView } from 'src/sections/pull-requests/pull-requests-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <title>{CONFIG.appName}</title>
      <PullRequestsView />
    </>
  );
}
