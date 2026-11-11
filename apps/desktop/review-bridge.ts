import type { Plugin } from 'vite';
import path from 'node:path';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';

// Development only. No arbitrary command dispatch, cross-origin reads or writes
// to the installed profile. gh keeps using the user's existing configuration.
export function reviewBridge(): Plugin {
  const root = path.resolve(process.cwd(), '../..');
  const profile = path.join(root, 'packages', 'review-profile');
  const originalAppData = process.env.APPDATA;
  const executable = path.join(
    root,
    'target',
    'debug',
    process.platform === 'win32' ? 'wakeline-review.exe' : 'wakeline-review'
  );
  const allowed = new Set([
    'get_account',
    'get_intelligence',
    'get_dashboard_data',
    'get_github_workspace',
    'get_remote_pr_details',
    'ask_pr_agent',
    'get_review_agents',
    'ask_review_agent',
    'get_mcp_executable',
    'history_import_status',
    'check_update',
  ]);
  return {
    name: 'wakeline-review-bridge',
    apply: 'serve',
    configureServer(server) {
      mkdirSync(path.join(profile, 'wakeline'), { recursive: true });
      const state = originalAppData && path.join(originalAppData, 'wakeline', 'state.json');
      if (state && existsSync(state) && !existsSync(path.join(profile, 'wakeline', 'state.json')))
        copyFileSync(state, path.join(profile, 'wakeline', 'state.json'));
      server.middlewares.use('/__wakeline/read', (request, response) => {
        const host = request.headers.host ?? '';
        const origin = request.headers.origin;
        const finish = (status: number, body: unknown) => {
          response.statusCode = status;
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(body));
        };
        if (
          !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) ||
          (origin && origin !== `http://${host}`) ||
          request.method !== 'POST'
        ) {
          finish(403, { error: 'LOCAL_REVIEW_ONLY' });
          return;
        }
        if (!existsSync(executable)) {
          finish(503, { error: 'REVIEW_BACKEND_NOT_BUILT' });
          return;
        }
        let raw = '';
        request.on('data', (chunk) => {
          raw += chunk;
          if (raw.length > 20 * 1024 * 1024) {
            finish(413, { error: 'IMAGE_LIMIT' });
            request.destroy();
          }
        });
        request.on('end', () => {
          let input: { command: string; args: unknown };
          try {
            input = JSON.parse(raw);
          } catch {
            finish(400, { error: 'INVALID_REQUEST' });
            return;
          }
          if (!allowed.has(input.command)) {
            finish(403, { error: 'DESKTOP_ACTION_REQUIRED' });
            return;
          }
          const ghConfig =
            process.env.GH_CONFIG_DIR ||
            (process.env.XDG_CONFIG_HOME
              ? path.join(process.env.XDG_CONFIG_HOME, 'gh')
              : originalAppData
                ? path.join(originalAppData, 'GitHub CLI')
                : path.join(process.env.HOME ?? '', '.config', 'gh'));
          const child = execFile(
            executable,
            [input.command, '--stdin'],
            {
              cwd: root,
              windowsHide: true,
              timeout: 240000,
              maxBuffer: 32 * 1024 * 1024,
              env: {
                ...process.env,
                APPDATA: profile,
                GH_CONFIG_DIR: ghConfig,
                WAKELINE_REVIEW_CLI: path.join(
                  root,
                  'target',
                  'release',
                  process.platform === 'win32' ? 'wakeline.exe' : 'wakeline'
                ),
              },
            },
            (error, stdout) => {
              if (error) {
                finish(503, { error: error.killed ? 'REVIEW_TIMEOUT' : 'REVIEW_BACKEND_FAILED' });
                return;
              }
              try {
                const result = JSON.parse(stdout);
                finish(result.ok ? 200 : 502, result.ok ? result.value : { error: result.error });
              } catch {
                finish(502, { error: 'INVALID_BACKEND_RESPONSE' });
              }
            }
          );
          child.stdin?.on('error', () => {});
          child.stdin?.end(JSON.stringify(input.args ?? {}));
        });
      });
    },
  };
}
