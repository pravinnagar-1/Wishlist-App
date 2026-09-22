-- Enables Row Level Security on every table in the public schema, with no
-- policies defined. This blocks Supabase's auto-generated PostgREST API
-- (anon / authenticated roles) from reading or writing these tables, while
-- leaving Prisma's own connection (which connects as the table owner)
-- completely unaffected — RLS does not restrict the owner role unless
-- FORCE ROW LEVEL SECURITY is also set, which we are NOT setting here.
--
-- Run this once in the Supabase Dashboard → SQL Editor (or via `psql`).

ALTER TABLE public."Session"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Wishlist"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WishlistShare"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
