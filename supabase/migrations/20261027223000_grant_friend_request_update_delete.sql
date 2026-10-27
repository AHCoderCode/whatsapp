-- Keep RLS enabled and grant only the SQL operations already constrained
-- by the requester/recipient row-level policies.
GRANT UPDATE, DELETE ON TABLE public.aeroshell_friend_requests TO authenticated;
