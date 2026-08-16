-- Mars-Fit 저장소 스키마
-- Supabase → SQL Editor 에 그대로 붙여넣고 실행할 것.
--
-- 구조는 길벗(github.com/Gilbut2026)의 users / user_mobility_profile 을 따랐다.
-- 다른 점 하나: 길벗은 온보딩 질문마다 컬럼을 만들었지만, 우리 프로필은
-- 10개 키에 계속 바뀌고 매칭 엔진에 dict 그대로 넘어가므로 jsonb 한 칸에
-- 통째로 넣는다. 질문이 늘어도 마이그레이션이 필요 없다.

create table if not exists users (
  id          bigserial primary key,
  provider_id text        not null unique,   -- 카카오 회원번호
  username    text        not null,
  created_at  timestamptz not null default now()
);

comment on column users.provider_id is
  '카카오 회원번호. 이메일·전화번호는 비즈 앱 전환 전에는 못 받으므로 이것이 유일한 식별자다.';

create table if not exists user_profiles (
  user_id    bigint      primary key references users(id) on delete cascade,
  profile    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on column user_profiles.profile is
  'policy_data/schema.md 의 키를 그대로 담는다. 매칭 엔진에 이 값이 그대로 들어간다.';

-- updated_at 을 애플리케이션에서 챙기면 빠뜨린다. DB 가 하게 둔다.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_profiles_touch on user_profiles;
create trigger user_profiles_touch
  before update on user_profiles
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS: 두 테이블 모두 켜두고 정책은 만들지 않는다.
--
-- 우리 서버는 service_role 키로 붙는데 그 키는 RLS 를 통과한다.
-- 정책이 없으면 anon 키로는 아무것도 못 읽는다 — 그게 우리가 원하는 상태다.
-- 나중에 프론트에서 Supabase 를 직접 부르게 되면 그때 정책을 추가할 것.
-- ---------------------------------------------------------------------
alter table users         enable row level security;
alter table user_profiles enable row level security;
