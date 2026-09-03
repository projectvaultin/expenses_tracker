-- ProjectVault: safe cleanup/fix
-- Does not drop tables or delete application data.
BEGIN;

-- Keep the existing username search function intact for backward compatibility.
-- Add the new shared-money search function instead.
CREATE OR REPLACE FUNCTION public.search_users_for_shared_money(p_query text)
RETURNS TABLE(auth_user_id uuid, username text, name text, avatar text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.auth_user_id, u.username, u.name, u.avatar
  FROM public.users u
  WHERE u.auth_user_id IS NOT NULL
    AND u.auth_user_id <> auth.uid()
    AND trim(p_query) <> ''
    AND (u.username ILIKE '%' || trim(p_query) || '%'
         OR u.name ILIKE '%' || trim(p_query) || '%')
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker = auth.uid() AND b.blocked = u.auth_user_id)
         OR (b.blocker = u.auth_user_id AND b.blocked = auth.uid())
    )
  ORDER BY CASE
    WHEN lower(u.username) = lower(trim(p_query)) THEN 0
    WHEN lower(u.name) = lower(trim(p_query)) THEN 1
    ELSE 2 END,
    u.name NULLS LAST, u.username
  LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.search_users_for_shared_money(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users_for_shared_money(text) TO authenticated;

-- Replace only the shared-debt INSERT rule; no rows are removed.
DROP POLICY IF EXISTS pv_shared_debts_insert ON public.shared_debts;
CREATE POLICY pv_shared_debts_insert ON public.shared_debts
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = lender_id
  AND lender_id <> borrower_id
  AND NOT EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker = auth.uid() AND b.blocked = borrower_id)
       OR (b.blocker = borrower_id AND b.blocked = auth.uid())
  )
);

COMMIT;
