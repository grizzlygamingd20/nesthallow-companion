-- Grove Naturalist, migration 0001: the field journal.
--
-- Integrity rules enforced here, not just in the app, so no client (website,
-- companion app, future connector) can break them:
--   * original field notes are write-once
--   * identifications, observation notes, research notes and their sources are
--     append-only; a correction is a new row that supersedes the old one
--   * a photo's original file reference and hash never change
--   * nothing real can be deleted; only rows marked is_sample can be purged,
--     and only through purge_sample_data()
--   * an AI author can never record a direct field observation

create type id_status   as enum ('confirmed', 'tentative', 'unknown');
create type author_kind as enum ('keeper', 'nesthallow', 'other_ai');
create type note_basis  as enum ('field_observation', 'ai_interpretation', 'literature', 'question');

create table expeditions (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(trim(title)) > 0),
  started_at      timestamptz not null,
  ended_at        timestamptz,
  place_name      text,
  lat             double precision check (lat between -90 and 90),
  lng             double precision check (lng between -180 and 180),
  location_public boolean not null default false,
  habitat         text,
  weather         text,
  summary         text,
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((lat is null) = (lng is null)),
  check (ended_at is null or ended_at >= started_at)
);

create table observations (
  id             uuid primary key default gen_random_uuid(),
  expedition_id  uuid not null references expeditions(id),
  observed_at    timestamptz not null,
  lat            double precision check (lat between -90 and 90),
  lng            double precision check (lng between -180 and 180),
  accuracy_m     real check (accuracy_m >= 0),
  count          integer check (count >= 0),
  behaviour      text,
  original_notes text,
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index observations_expedition_idx on observations (expedition_id, observed_at);

create table observation_notes (
  id             uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id),
  author         author_kind not null,
  body           text not null check (length(trim(body)) > 0),
  created_at     timestamptz not null default now()
);
create index observation_notes_obs_idx on observation_notes (observation_id, created_at);

-- Species reference. Free text in V1; iNaturalist lookup fills external_* in M3.
create table taxa (
  id              uuid primary key default gen_random_uuid(),
  scientific_name text,
  common_name     text,
  rank            text,
  external_source text,          -- 'inaturalist' from M3
  external_id     text,
  created_at      timestamptz not null default now(),
  check (scientific_name is not null or common_name is not null),
  unique (external_source, external_id)
);

create table identifications (
  id             uuid primary key default gen_random_uuid(),
  observation_id uuid not null references observations(id),
  taxon_id       uuid references taxa(id),
  name_as_given  text,
  status         id_status not null,
  identified_by  author_kind not null,
  method         text,           -- 'in person', 'from photo', 'field guide', ...
  reasoning      text,
  supersedes_id  uuid unique references identifications(id),
  created_at     timestamptz not null default now(),
  -- "unknown" carries no name; confirmed and tentative must name something.
  check (status <> 'unknown' or (taxon_id is null and name_as_given is null)),
  check (status = 'unknown' or taxon_id is not null or name_as_given is not null)
);
create index identifications_obs_idx on identifications (observation_id, created_at);

create table media (
  id             uuid primary key default gen_random_uuid(),
  observation_id uuid references observations(id),
  expedition_id  uuid references expeditions(id),
  original_key   text not null unique,  -- private blob, untouched, metadata kept
  display_key    text not null unique,  -- resized copy, all metadata stripped
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime           text not null,
  bytes          integer not null check (bytes > 0),
  width          integer,
  height         integer,
  taken_at       timestamptz,
  caption        text,
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now(),
  check (observation_id is not null or expedition_id is not null)
);

create table research_notes (
  id              uuid primary key default gen_random_uuid(),
  expedition_id   uuid references expeditions(id),
  observation_id  uuid references observations(id),
  taxon_id        uuid references taxa(id),
  author          author_kind not null,
  basis           note_basis not null,
  title           text,
  body            text not null check (length(trim(body)) > 0),
  confidence      text,          -- plain words: 'likely', 'speculative', ...
  sketch_media_id uuid references media(id),
  supersedes_id   uuid unique references research_notes(id),
  is_sample       boolean not null default false,
  created_at      timestamptz not null default now(),
  -- Only the Keeper makes direct field observations. AI notes are interpretations.
  check (author = 'keeper' or basis <> 'field_observation')
);

create table note_sources (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references research_notes(id),
  citation   text not null check (length(trim(citation)) > 0),
  url        text,
  created_at timestamptz not null default now()
);

-- The current identification of each observation: the newest one nothing supersedes.
create view current_identifications as
select i.*
from identifications i
where not exists (select 1 from identifications n where n.supersedes_id = i.id);

-- ---------- integrity triggers ----------

create function naturalist_purging() returns boolean language sql stable as $$
  select coalesce(current_setting('naturalist.purging_samples', true), '') = 'on'
$$;

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger expeditions_touch before update on expeditions
  for each row execute function touch_updated_at();

-- Append-only tables: no edits, ever; deletes only during a sample purge.
create function reject_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and naturalist_purging() then
    return old;
  end if;
  raise exception '% rows are append-only: add a new row instead of changing this one', tg_table_name
    using errcode = 'check_violation';
end $$;

create trigger identifications_append_only before update or delete on identifications
  for each row execute function reject_change();
create trigger observation_notes_append_only before update or delete on observation_notes
  for each row execute function reject_change();
create trigger research_notes_append_only before update or delete on research_notes
  for each row execute function reject_change();
create trigger note_sources_append_only before update or delete on note_sources
  for each row execute function reject_change();

-- Real (non-sample) records are never deleted.
create function reject_real_delete() returns trigger language plpgsql as $$
begin
  if old.is_sample and naturalist_purging() then
    return old;
  end if;
  raise exception 'real % records are never deleted', tg_table_name
    using errcode = 'check_violation';
end $$;

create trigger expeditions_no_delete before delete on expeditions
  for each row execute function reject_real_delete();
create trigger observations_no_delete before delete on observations
  for each row execute function reject_real_delete();
create trigger media_no_delete before delete on media
  for each row execute function reject_real_delete();

-- Original field notes are write-once: they can be filled in once, never changed.
create function observations_guard() returns trigger language plpgsql as $$
begin
  if old.original_notes is not null and new.original_notes is distinct from old.original_notes then
    raise exception 'original field notes are write-once; add an observation note instead'
      using errcode = 'check_violation';
  end if;
  if new.is_sample is distinct from old.is_sample then
    raise exception 'is_sample cannot change after creation' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger observations_write_once before update on observations
  for each row execute function observations_guard();

create function media_guard() returns trigger language plpgsql as $$
begin
  if new.original_key is distinct from old.original_key
     or new.sha256 is distinct from old.sha256
     or new.mime is distinct from old.mime
     or new.bytes is distinct from old.bytes
     or new.is_sample is distinct from old.is_sample then
    raise exception 'a photo''s original, hash and type never change' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger media_write_once before update on media
  for each row execute function media_guard();

create function expeditions_guard() returns trigger language plpgsql as $$
begin
  if new.is_sample is distinct from old.is_sample then
    raise exception 'is_sample cannot change after creation' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger expeditions_sample_fixed before update on expeditions
  for each row execute function expeditions_guard();

-- A correction must supersede an identification of the same observation.
create function identifications_supersede_check() returns trigger language plpgsql as $$
begin
  if new.supersedes_id is not null and not exists (
    select 1 from identifications o
    where o.id = new.supersedes_id and o.observation_id = new.observation_id
  ) then
    raise exception 'a correction must supersede an identification of the same observation'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger identifications_supersede before insert on identifications
  for each row execute function identifications_supersede_check();

-- Sample rows inherit from their parents: a sample expedition's children are samples,
-- and a real expedition can't hold sample observations.
create function observations_sample_check() returns trigger language plpgsql as $$
begin
  if new.is_sample <> (select e.is_sample from expeditions e where e.id = new.expedition_id) then
    raise exception 'an observation''s is_sample must match its expedition''s'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger observations_sample before insert on observations
  for each row execute function observations_sample_check();

-- Removes every row marked as sample data, and nothing else.
create function purge_sample_data() returns integer language plpgsql as $$
declare
  n integer := 0;
  c integer;
begin
  perform set_config('naturalist.purging_samples', 'on', true);
  delete from note_sources where note_id in (select id from research_notes where is_sample);
  get diagnostics c = row_count; n := n + c;
  -- notes may supersede each other: clear newest first
  loop
    delete from research_notes r
    where r.is_sample and not exists (select 1 from research_notes x where x.supersedes_id = r.id);
    get diagnostics c = row_count; n := n + c;
    exit when c = 0;
  end loop;
  delete from observation_notes where observation_id in (select id from observations where is_sample);
  get diagnostics c = row_count; n := n + c;
  loop
    delete from identifications i
    where i.observation_id in (select id from observations where is_sample)
      and not exists (select 1 from identifications x where x.supersedes_id = i.id);
    get diagnostics c = row_count; n := n + c;
    exit when c = 0;
  end loop;
  delete from media where is_sample;
  get diagnostics c = row_count; n := n + c;
  delete from observations where is_sample;
  get diagnostics c = row_count; n := n + c;
  delete from expeditions where is_sample;
  get diagnostics c = row_count; n := n + c;
  perform set_config('naturalist.purging_samples', 'off', true);
  return n;
end $$;
