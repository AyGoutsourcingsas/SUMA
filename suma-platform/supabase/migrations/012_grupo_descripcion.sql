-- ============================================================
-- SUMA ERP — Migración 012: Descripción en carpetas/grupos
-- El admin puede describir qué contiene cada carpeta. Idempotente.
-- ============================================================
ALTER TABLE public.item_groups
  ADD COLUMN IF NOT EXISTS description text;
