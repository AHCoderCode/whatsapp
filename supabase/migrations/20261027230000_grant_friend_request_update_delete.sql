-- The existing RLS policies restrict update/delete to the recipient or requester.
-- Grant the SQL privileges required for accept/decline/cancel; do not disable RLS.
GRANT UPDATE, DELETE ON TABLE public.aeroshell_friend_requests TO authenticated;
