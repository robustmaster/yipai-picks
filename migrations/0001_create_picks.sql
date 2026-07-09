create table if not exists picks (
  id text primary key,
  name text not null,
  avatar_image text,
  intro text,
  platform text not null default '',
  tags text not null default '[]',
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_picks_sort_order on picks (sort_order, created_at);
