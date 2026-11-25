create table if not exists public.raffle_settings (
  id integer primary key check (id = 1),
  settings jsonb not null
);

create table if not exists public.raffle_entries (
  ticket text primary key,
  normalized_contact text not null unique,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.raffle_draw_state (
  id integer primary key check (id = 1),
  results jsonb not null default '[]'::jsonb
);

insert into public.raffle_draw_state (id, results)
values (1, '[]'::jsonb)
on conflict (id) do nothing;

alter table public.raffle_settings enable row level security;
alter table public.raffle_entries enable row level security;
alter table public.raffle_draw_state enable row level security;

grant all on public.raffle_settings to service_role;
grant all on public.raffle_entries to service_role;
grant all on public.raffle_draw_state to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'raffle-proofs',
  'raffle-proofs',
  false,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.toggle_raffle_entry_status(p_ticket text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
begin
  perform 1 from public.raffle_draw_state where id = 1 for update;

  update public.raffle_entries
  set data = jsonb_set(
    data,
    '{status}',
    to_jsonb(case when data->>'status' = 'Eligible' then 'Review' else 'Eligible' end),
    true
  )
  where ticket = p_ticket
  returning data into v_entry;

  if not found then
    return jsonb_build_object('success', false);
  end if;

  return jsonb_build_object('success', true, 'entry', v_entry);
end;
$$;

create or replace function public.draw_next_raffle_winner()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_results jsonb;
  v_round integer;
  v_remaining integer;
  v_eligible_count integer;
  v_winner jsonb;
  v_result jsonb;
  v_drawn_at timestamptz := now();
begin
  select results into v_results
  from public.raffle_draw_state
  where id = 1
  for update;

  v_round := jsonb_array_length(v_results) + 1;
  if v_round > 6 then
    return jsonb_build_object(
      'success', false,
      'status', 409,
      'error', 'All six raffle prizes have already been drawn.'
    );
  end if;

  v_remaining := 7 - v_round;
  select count(*) into v_eligible_count
  from public.raffle_entries entry
  where entry.data->>'status' = 'Eligible'
    and not exists (
      select 1
      from jsonb_array_elements(v_results) previous
      where previous->'winner'->>'ticket' = entry.ticket
    );

  if v_eligible_count < v_remaining then
    return jsonb_build_object(
      'success', false,
      'status', 400,
      'error', format(
        'At least %s unique eligible entries are needed to continue the six-winner draw.',
        v_remaining
      )
    );
  end if;

  select entry.data into v_winner
  from public.raffle_entries entry
  where entry.data->>'status' = 'Eligible'
    and not exists (
      select 1
      from jsonb_array_elements(v_results) previous
      where previous->'winner'->>'ticket' = entry.ticket
    )
  order by random()
  limit 1;

  v_result := jsonb_build_object(
    'round', v_round,
    'prize', case when v_round = 6 then '25 kg rice' else '5 kg rice' end,
    'winner', v_winner,
    'drawnAt', v_drawn_at
  );
  v_results := v_results || jsonb_build_array(v_result);

  update public.raffle_draw_state
  set results = v_results
  where id = 1;

  return jsonb_build_object(
    'success', true,
    'round', v_round,
    'prize', v_result->>'prize',
    'winner', v_winner,
    'drawnAt', v_drawn_at,
    'results', v_results,
    'nextRound', case when v_round < 6 then v_round + 1 else null end,
    'nextPrize', case
      when v_round < 5 then '5 kg rice'
      when v_round = 5 then '25 kg rice'
      else null
    end
  );
end;
$$;

revoke all on function public.toggle_raffle_entry_status(text) from public, anon, authenticated;
revoke all on function public.draw_next_raffle_winner() from public, anon, authenticated;
grant execute on function public.toggle_raffle_entry_status(text) to service_role;
grant execute on function public.draw_next_raffle_winner() to service_role;
