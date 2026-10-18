-- ============================================================
--  Ghost Club ポータル用 Supabase セットアップ
--  Supabase ダッシュボード → SQL Editor に貼り付けて「Run」
--  ※ 管理者（てんどん・ぺとら）のDiscordユーザーIDは入力済みです。そのまま実行できます
-- ============================================================

-- 管理者のDiscordユーザーID（数字18〜19桁ほど）を登録する表
create table if not exists public.admins (
  discord_id text primary key,
  note text
);
alter table public.admins enable row level security;
-- ポリシーは作らない = ブラウザからは誰も読み書きできない

-- 管理者の判定（Discordログイン時の本人ID。ユーザーが書き換えられない値で判定）
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from auth.identities i
    join public.admins a on a.discord_id = i.provider_id
    where i.user_id = auth.uid() and i.provider = 'discord'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- メンバー紹介カード
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  intro text,
  icon_url text,
  link_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 個人チャンネル
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3b82f6',
  icon_url text,
  youtube_channel_id text,
  links jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 閲覧は誰でも、追加・編集・削除は管理者だけ
alter table public.members enable row level security;
alter table public.channels enable row level security;

drop policy if exists "members read" on public.members;
drop policy if exists "members admin write" on public.members;
create policy "members read" on public.members for select using (true);
create policy "members admin write" on public.members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "channels read" on public.channels;
drop policy if exists "channels admin write" on public.channels;
create policy "channels read" on public.channels for select using (true);
create policy "channels admin write" on public.channels for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- アイコン画像の保存場所（読み取りは公開、アップロード・削除は管理者のみ）
insert into storage.buckets (id, name, public)
values ('icons', 'icons', true)
on conflict (id) do nothing;

drop policy if exists "icons public read" on storage.objects;
drop policy if exists "icons admin insert" on storage.objects;
drop policy if exists "icons admin update" on storage.objects;
drop policy if exists "icons admin delete" on storage.objects;
create policy "icons public read" on storage.objects for select
  using (bucket_id = 'icons');
create policy "icons admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'icons' and public.is_admin());
create policy "icons admin update" on storage.objects for update to authenticated
  using (bucket_id = 'icons' and public.is_admin());
create policy "icons admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'icons' and public.is_admin());

-- 管理者を登録（てんどん・ぺとら）
insert into public.admins (discord_id, note)
values
  ('1497478159526789120', '夜桜てんどん（web管理者）'),
  ('1141664701034528850', 'ぺとら')
on conflict (discord_id) do nothing;

-- いま表示している2人の個人チャンネルを初期データとして登録
insert into public.channels (name, color, icon_url, youtube_channel_id, links, sort_order)
values
('夜桜てんどん', '#ff7700', 'tendon-icon.png', 'UCgzALvAchpNYm1Hvgn_0OcA',
 '[{"label":"メインチャンネル","handle":"@てんどん_ch","url":"https://www.youtube.com/@てんどん_ch"},
   {"label":"サブチャンネル","handle":"@てんどん_ch_sub","url":"https://www.youtube.com/@てんどん_ch_sub"},
   {"label":"生声アカウント","handle":"@てんどん_ch_namakoe","url":"https://www.youtube.com/@てんどん_ch_namakoe"}]'::jsonb, 1),
('ぺとら', '#ff4757', 'petra-icon.png', 'UCMJ8WfI4YRVYI4pCLCrDr5g',
 '[{"label":"メインアカウント","handle":"@petra-0143","url":"https://www.youtube.com/@petra-0143"},
   {"label":"サブチャンネル","handle":"@patra.ptora.0143","url":"https://www.youtube.com/@patra.ptora.0143"},
   {"label":"生声アカウント","handle":"@PetoUltra-GC-510","url":"https://www.youtube.com/@PetoUltra-GC-510"}]'::jsonb, 2);
