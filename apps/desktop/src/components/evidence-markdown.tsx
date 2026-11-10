import remarkGfm from 'remark-gfm';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { varAlpha } from 'minimal-shared/utils';

import Box from '@mui/material/Box';

import { openExternal } from 'src/services/wakeline';

export function EvidenceMarkdown({ text }: { text: string }) {
  return (
    <Box
      sx={(theme) => ({
        mt: 2,
        p: 2,
        borderRadius: 1.5,
        fontSize: 14,
        lineHeight: 1.8,
        overflowWrap: 'anywhere',
        color: 'text.primary',
        bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
        '& > :first-child': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& p': { my: 1.5, whiteSpace: 'pre-wrap' },
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          color: 'primary.main',
          lineHeight: 1.5,
          mt: 2,
          mb: 1,
        },
        '& h1': { fontSize: 22 },
        '& h2': { fontSize: 20 },
        '& h3': { fontSize: 18 },
        '& strong': { color: 'primary.main', fontWeight: 700 },
        '& em': { color: 'success.main' },
        '& a': { color: 'primary.main', textDecoration: 'underline' },
        '& ul, & ol': { pl: 3 },
        '& li': { my: 0.5 },
        '& li::marker': { color: 'primary.main', fontWeight: 700 },
        '& blockquote': {
          mx: 0,
          pl: 2,
          borderLeft: '3px solid',
          borderColor: 'primary.main',
          color: 'text.secondary',
        },
        '& hr': { my: 2.5, border: 0, borderTop: '1px solid', borderColor: 'divider' },
        '& code': { fontFamily: 'Consolas, monospace', fontSize: '0.9em' },
        '& :not(pre) > code': {
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          color: 'warning.main',
          bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
        },
        '& pre': {
          p: 2,
          overflowX: 'auto',
          whiteSpace: 'pre',
          borderRadius: 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
        },
        '& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal': { color: 'secondary.main' },
        '& .hljs-string, & .hljs-comment, & .hljs-quote': { color: 'success.main' },
        '& .hljs-number, & .hljs-attr, & .hljs-symbol': { color: 'warning.main' },
        '& .hljs-title, & .hljs-built_in, & .hljs-type': { color: 'info.main' },
        '& table': { display: 'block', overflowX: 'auto', borderCollapse: 'collapse', my: 2 },
        '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1.5, py: 0.75 },
        '& th': { color: 'primary.main', fontWeight: 700 },
      })}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  void openExternal(href);
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {text}
      </Markdown>
    </Box>
  );
}
