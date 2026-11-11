// Synthetic documentation data. Never imported by the production application.
const day = new Date().toISOString().slice(0, 10);
const at = (days, hour = 10) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) +
  'T' +
  String(hour).padStart(2, '0') +
  ':00:00Z';
const avatar =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#245c58"/><text x="40" y="51" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#d9f3eb">M</text></svg>'
  ).toString('base64');
const names = [
  'Handle repeated payment webhooks',
  'Cover refund rounding with tests',
  'Save a release note when a PR merges',
  'Reject empty invoice references',
  'Document offline checkout behavior',
  'Redact tokens in command output',
];
export const cards = names.map((title, i) => ({
  fingerprint: 'docs-card-' + i,
  short_id: 'doc' + i,
  kind: ['error', 'task', 'idea', 'error', 'task', 'task'][i],
  status: i === 5 ? 'done' : i === 3 || i === 4 ? 'accepted' : 'new',
  title,
  project: i === 3 ? 'mobile' : 'checkout',
  branch: i === 3 ? 'fix/invoices' : 'main',
  source_kind: i === 0 ? 'command' : 'session',
  source_label: i === 0 ? 'typecheck' : 'claude',
  location: i === 0 ? 'src/payments/webhook.ts:42' : 'src/refunds/total.ts:18',
  code_excerpt: 'if (events.has(event.id)) return;\nawait recordPayment(event);',
  evidence:
    'The same webhook arrived twice. Keep the event id before recording a payment, then add a regression test.',
  session_id: null,
  occurrences: i === 0 ? 3 : 1,
  first_seen: day,
  last_seen: day,
  fingerprints: ['docs-card-' + i],
  origins: [],
  url: null,
}));
const projects = ['checkout', 'mobile', 'design-system'].map((name, i) => ({
  name,
  path: '/example/' + name,
  branch: 'main',
  active: true,
  errors: i === 0 ? 1 : i === 1 ? 1 : 0,
  tasks: i === 0 ? 2 : 0,
  ideas: i === 0 ? 1 : 0,
  done: i === 0 ? 1 : 0,
  dismissed: 0,
  commands_pending: false,
}));
export const dashboard = {
  cards,
  projects,
  spec_gaps: [],
  pull_requests: [],
  session_files: 14,
  megabytes_read: 2.4,
  scan_ms: 86,
};
const user = { login: 'mira-dev', name: 'Mira', avatar_url: avatar };
export const account = {
  github: user,
  claude_code: true,
  codex_mcp: true,
  antigravity_mcp: true,
  ollama: false,
  version: '0.1.5',
};
export const github = {
  user,
  repositories: projects.map((p, i) => ({
    name: 'orbit/' + p.name,
    url: 'https://github.com/orbit/' + p.name,
    description: [
      'Payments and checkout for the Orbit demo store',
      'Mobile companion application',
      'Shared interface components',
    ][i],
    language: i === 1 ? 'Dart' : 'TypeScript',
    private: false,
    stars: [124, 38, 72][i],
    pushed_at: at(i),
  })),
  pull_requests: [
    'Avoid recording duplicate webhook payments',
    'Add refund rounding regression tests',
    'Improve the offline checkout message',
    'Extract shared button components',
  ].map((title, i) => ({
    id: 'docs-pr-' + i,
    repository: 'orbit/' + projects[i === 3 ? 2 : 0].name,
    number: 42 - i,
    title,
    url: 'https://github.com/orbit/checkout/pull/' + (42 - i),
    state: ['review', 'open', 'merged', 'merged'][i],
    review: i === 0 ? 'changes_requested' : 'none',
    draft: false,
    branch: ['fix/webhook-dedup', 'test/refund-rounding', 'fix/offline-copy', 'refactor/buttons'][
      i
    ],
    author: i === 1 ? 'leo-dev' : 'mira-dev',
    avatar_url: avatar,
    created_at: at(i + 1),
    updated_at: at(i),
    merged_at: i > 1 ? at(i) : null,
    first_review_at: at(i + 1, 12),
    additions: [42, 78, 12, 96][i],
    deletions: [8, 0, 6, 44][i],
    comments: [3, 1, 2, 4][i],
  })),
  commits: Array.from({ length: 34 }, (_, i) => ({
    repository: 'orbit/' + projects[i % 3].name,
    sha: 'docs-' + i,
    at: at(i % 7, 9 + (i % 10)),
    author: i % 3 === 0 ? 'leo-dev' : 'mira-dev',
    avatar_url: avatar,
  })),
  warnings: [],
};
export const detail = {
  body: '## Summary\nIgnore webhook events that were already recorded before creating a payment.\n\n## Evidence\nAdded a repeated-event regression test and checked the refund flow.\n\n## Review notes\nNo schema changes. Existing invoice references stay unchanged.',
  files: [
    {
      filename: 'src/payments/webhook.ts',
      additions: 6,
      deletions: 2,
      patch:
        '@@ -12,4 +12,8 @@ export async function record(event: PaymentEvent) {\n const invoice = await findInvoice(event.invoiceId);\n- await createPayment(invoice, event.amount);\n+ const existing = await findEvent(event.id);\n+ if (existing) return existing.payment;\n+ const payment = await createPayment(invoice, event.amount);\n+ await rememberEvent(event.id, payment.id);\n+ return payment;\n }',
    },
    {
      filename: 'src/payments/webhook.test.ts',
      additions: 14,
      deletions: 0,
      patch:
        '@@ -1,2 +1,5 @@\n describe("payment webhooks", () => {\n+ it("records a repeated event once", async () => {\n+   expect(await recordTwice(event)).toHaveLength(1);\n+ });\n });',
    },
  ],
};
export function response(command) {
  switch (command) {
    case 'get_dashboard_data':
      return dashboard;
    case 'get_account':
      return account;
    case 'get_github_workspace':
      return github;
    case 'get_remote_pr_details':
      return detail;
    case 'get_review_agents':
      return [
        {
          id: 'claude',
          name: 'Claude',
          installed: true,
          available: true,
          models: ['sonnet', 'claude-sonnet-5-5', 'claude-opus-5-5'],
          efforts: {
            sonnet: ['default', 'low', 'medium', 'high'],
            'claude-sonnet-5-5': ['default', 'low', 'medium', 'high'],
            'claude-opus-5-5': ['default', 'low', 'medium', 'high', 'max'],
          },
          images: true,
        },
      ];
    case 'ask_pr_agent':
    case 'ask_review_agent':
      return 'The event id is now checked before recording the payment. Add a concurrency test to verify that two simultaneous deliveries cannot create duplicate records.';
    case 'get_intelligence':
      return {
        config: { mode: 'off', endpoint: 'http://127.0.0.1:11434', model: '' },
        has_key: false,
        secure_storage: true,
      };
    case 'get_startup_enabled':
    case 'history_import_status':
      return false;
    case 'get_mcp_executable':
      return 'C:\\Program Files\\Wakeline\\wakeline.exe';
    case 'check_update':
      return { state: 'up_to_date', current_version: '0.1.5', version: '0.1.5' };
    default:
      return null;
  }
}
