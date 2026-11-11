import type { UiCard } from 'src/services/wakeline';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { RouterLink } from 'src/routes/components';

import { localDay } from 'src/services/daily-summary-state';
import {
  isSnoozed,
  snoozeCard,
  getWorkflow,
  cardHistory,
  priorityCards,
} from 'src/services/card-workflow';

export function useWorkflow() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    window.addEventListener('wakeline:workflow', update);
    const timer = setInterval(update, 30000);
    return () => {
      window.removeEventListener('wakeline:workflow', update);
      clearInterval(timer);
    };
  }, []);
  return { ...getWorkflow() };
}

export function CardWorkflow({ card }: { card: UiCard }) {
  const { t, i18n } = useTranslation();
  const workflow = useWorkflow();
  const paused = isSnoozed(card, workflow);
  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {paused ? (
          <Button onClick={() => snoozeCard(card, null)}>{t('workflow.resume')}</Button>
        ) : (
          (card.status === 'new' || card.status === 'accepted') && (
            <>
              <Button
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  tomorrow.setHours(0, 0, 0, 0);
                  snoozeCard(card, { until: tomorrow.getTime() });
                }}
              >
                {t('workflow.tomorrow')}
              </Button>
              <Button onClick={() => snoozeCard(card, { occurrences: card.occurrences })}>
                {t('workflow.recurrence')}
              </Button>
            </>
          )
        )}
      </Box>
      <Typography variant="h6">{t('workflow.history')}</Typography>
      <Box component="ol" sx={{ pl: 2.5 }}>
        {cardHistory(card).map((event, index) => (
          <Box component="li" key={`${event.at}-${index}`} sx={{ py: 1 }}>
            <Typography variant="body2">
              {t(`workflow.event.${event.event}`)} · {t(`common.${event.status}`)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(event.at)}{' '}
              · ×{event.occurrences}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function CardPriorities({ cards }: { cards: UiCard[] }) {
  const { t } = useTranslation();
  const workflow = useWorkflow();
  const priorities = priorityCards(cards, workflow, localDay());
  if (!priorities.length) return null;
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {t('workflow.priority')}
      </Typography>
      <Box
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}
      >
        {priorities.map(({ card, reason }) => (
          <Button
            key={card.fingerprint}
            component={RouterLink}
            href={`/cards/${encodeURIComponent(card.fingerprint)}`}
            color="inherit"
            sx={{
              p: 2,
              textAlign: 'left',
              display: 'block',
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {card.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {card.project} ·{' '}
              {t(`workflow.reason.${reason}`, {
                count:
                  reason == 'aging'
                    ? Math.max(0, Math.floor((Date.now() - Date.parse(card.first_seen)) / 86400000))
                    : card.occurrences,
              })}
            </Typography>
          </Button>
        ))}
      </Box>
    </Box>
  );
}
