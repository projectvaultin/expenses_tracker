-- ProjectVault: required supporting tables
-- CREATE TABLE IF NOT EXISTS only; existing tables/data are preserved.
BEGIN;

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker uuid NOT NULL,
  blocked uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_users_pk PRIMARY KEY (blocker, blocked),
  CONSTRAINT blocked_users_not_self CHECK (blocker <> blocked)
);

CREATE TABLE IF NOT EXISTS public.connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_requests_not_self CHECK (from_user <> to_user),
  CONSTRAINT connection_requests_status_check CHECK (status IN ('pending','accepted','rejected','cancelled')),
  CONSTRAINT connection_requests_unique_pair UNIQUE (from_user, to_user)
);

CREATE TABLE IF NOT EXISTS public.connections (
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connections_pk PRIMARY KEY (user_a, user_b),
  CONSTRAINT connections_not_self CHECK (user_a <> user_b),
  CONSTRAINT connections_ordered CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS public.shared_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_id uuid NOT NULL,
  borrower_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  reason text,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_debts_positive_amount CHECK (amount > 0),
  CONSTRAINT shared_debts_not_self CHECK (lender_id <> borrower_id),
  CONSTRAINT shared_debts_status_check CHECK (status IN ('pending','partially_paid','paid','overdue','cancelled'))
);

CREATE TABLE IF NOT EXISTS public.shared_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_debt_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  recorded_by uuid NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_debt_payments_positive_amount CHECK (amount > 0),
  CONSTRAINT shared_debt_payments_debt_fk FOREIGN KEY (shared_debt_id)
    REFERENCES public.shared_debts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_debts_lender ON public.shared_debts(lender_id);
CREATE INDEX IF NOT EXISTS idx_shared_debts_borrower ON public.shared_debts(borrower_id);
CREATE INDEX IF NOT EXISTS idx_shared_debts_created_at ON public.shared_debts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_debt_payments_debt ON public.shared_debt_payments(shared_debt_id);
CREATE INDEX IF NOT EXISTS idx_shared_debt_payments_recorded_by ON public.shared_debt_payments(recorded_by);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_debt_payments ENABLE ROW LEVEL SECURITY;

COMMIT;
