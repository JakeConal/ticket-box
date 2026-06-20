-- Keep the seeded audience flow purchasable in every local environment.
-- This runs after the fixed-date demo seed and also updates existing local databases.
UPDATE ticket_types AS ticket_type
SET sale_opens_at = now() - INTERVAL '1 minute'
FROM concerts AS concert
WHERE concert.id = ticket_type.concert_id
  AND concert.event_code IN (
      'ATSH-HCM-2026',
      'ATVNCG-HN-2026',
      'EXSH-HCM-2026',
      'CDDG-HN-2026'
  )
  AND ticket_type.sale_opens_at > now();
