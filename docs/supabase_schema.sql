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

-- ---------------------------------------------------------------------
-- service_role 에 테이블 권한 부여. **이걸 빼먹으면 안 된다.**
--
-- Data API 설정에서 'Automatically expose new tables' 를 끄면 새 테이블에
-- 권한이 자동으로 붙지 않는다. service_role 도 예외가 아니다.
-- 그 상태로 붙으면 이렇게 나온다:
--
--   42501  permission denied for table users
--
-- RLS 는 켜둔 채로 둔다. service_role 은 RLS 를 통과하므로 정책 없이도
-- 접근하고, anon 키로는 여전히 아무것도 못 읽는다.
--
-- sequences 줄이 없으면 조회는 되는데 users 에 INSERT 할 때 id 자동 증가가
-- 막힌다. 로그인하다가 신규 회원 생성에서만 실패하는 형태라 찾기 어렵다.
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on public.users, public.user_profiles to service_role;
grant usage, select on all sequences in schema public to service_role;

-- =====================================================================
-- 카카오톡 알림 (2026-08-23 추가)
--
-- 새벽에 서버가 카톡을 보내려면 그때 쓸 토큰이 있어야 한다. 로그인할 때
-- 받는 access_token 은 6시간이면 만료되므로 refresh_token 을 둔다.
--
-- **refresh_token 은 그 사람 카톡으로 메시지를 보낼 수 있는 자격증명이다.**
-- 저장소에 절대 넣지 않는다(public 저장소다). 여기와 서버 환경변수에만 둔다.
-- 알림을 끄면 행을 지운다 — 안 보낼 거면 들고 있을 이유가 없다.
-- =====================================================================

create table if not exists kakao_notify (
  user_id       bigint      primary key references users(id) on delete cascade,
  refresh_token text        not null,
  -- 카카오는 refresh_token 도 만료된다(2개월). 갱신하면 새 것이 딸려 온다.
  refreshed_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table kakao_notify is
  '카카오톡 「나에게 보내기」용 refresh_token. 알림을 끄면 행을 지운다.';

-- 같은 공고를 두 번 보내지 않기 위한 기록.
--
-- 이게 없으면 cron 이 매일 같은 공고를 다시 보낸다. 사장님 카톡에 같은
-- 메시지가 쌓이면 그 순간 알림을 꺼버린다.
create table if not exists kakao_sent (
  user_id   bigint      not null references users(id) on delete cascade,
  notice_id text        not null,
  kind      text        not null,          -- 'new' | 'deadline-1' | 'deadline-3' ...
  sent_at   timestamptz not null default now(),
  primary key (user_id, notice_id, kind)
);

comment on column kakao_sent.kind is
  '같은 공고라도 「새로 떴다」와 「내일 마감」은 따로 보낸다. 그래서 기본키에 넣는다.';

-- refreshed_at 은 애플리케이션이 못 채운다. PostgREST 본문에 "now()" 를
-- 넣으면 SQL 함수가 아니라 문자열로 들어가서 400 이 난다. DB 가 채운다.
create or replace function touch_refreshed_at() returns trigger as $$
begin
  new.refreshed_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kakao_notify_touch on kakao_notify;
create trigger kakao_notify_touch
  before insert or update on kakao_notify
  for each row execute function touch_refreshed_at();

alter table kakao_notify enable row level security;
alter table kakao_sent   enable row level security;

grant all on public.kakao_notify, public.kakao_sent to service_role;
