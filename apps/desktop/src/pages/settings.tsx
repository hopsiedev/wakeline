import { CONFIG } from 'src/config-global';

import { SettingsView } from 'src/sections/settings/settings-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <title>{CONFIG.appName}</title>
      <SettingsView />
    </>
  );
}
