-- =====================================================================
-- SC Botlek — positie "leenspeler" (speler van een ander team die meedoet)
-- Alleen de lijst met toegestane posities wordt uitgebreid; er verandert
-- niets aan bestaande spelers. Laag risico, daarom direct COMMIT.
-- =====================================================================

BEGIN;

ALTER TABLE public.players DROP CONSTRAINT players_position_check;
ALTER TABLE public.players ADD CONSTRAINT players_position_check
  CHECK (position IN ('keeper','verdediger','middenvelder','aanvaller','leenspeler'));

-- Controle
SELECT pg_get_constraintdef(oid) AS posities
  FROM pg_constraint WHERE conname = 'players_position_check';

COMMIT;
