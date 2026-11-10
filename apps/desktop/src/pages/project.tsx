import { CONFIG } from 'src/config-global';

import { ProjectView } from 'src/sections/projects/project-view';

// ----------------------------------------------------------------------

export default function Page() {
  return (
    <>
      <title>{CONFIG.appName}</title>
      <ProjectView />
    </>
  );
}
