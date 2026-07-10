create table if not exists site_settings (
  id integer primary key check (id = 1),
  site_name text not null,
  owner_label text not null default '',
  owner_url text not null default '',
  updated_at text not null
);

insert or ignore into site_settings (id, site_name, owner_label, owner_url, updated_at)
values (1, '一派 Picks', '@胡一派', 'https://yipai.me', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
