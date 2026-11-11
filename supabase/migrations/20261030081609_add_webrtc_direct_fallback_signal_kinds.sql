alter table public.aeroshell_call_signals
  drop constraint if exists aeroshell_call_signals_kind_check;

alter table public.aeroshell_call_signals
  add constraint aeroshell_call_signals_kind_check
  check (kind = any (array[
    'offer'::text,
    'answer'::text,
    'ice'::text,
    'fallback-request'::text,
    'fallback-offer'::text,
    'fallback-answer'::text,
    'fallback-ice'::text
  ]));
