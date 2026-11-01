-- Record when a direct WebRTC call actually connects.
-- accepted_at only means the callee tapped Accept; connected_at is written
-- only after a participant's RTCPeerConnection reaches the connected state.
ALTER TABLE public.aeroshell_calls
  ADD COLUMN IF NOT EXISTS connected_at timestamptz;

COMMENT ON COLUMN public.aeroshell_calls.connected_at IS
  'Set only after a participant WebRTC peer connection reaches connected; retained after the call ends to distinguish completed calls from calls that were merely accepted.';
