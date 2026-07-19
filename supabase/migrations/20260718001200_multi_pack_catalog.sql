begin;

alter table public.pack_templates
  drop constraint pack_templates_target_relationship_check;

alter table public.pack_templates
  add constraint pack_templates_target_relationship_check
  check (target_relationship in (
    'old_friend',
    'new_connection',
    'coworker',
    'close_relationship'
  ));

update public.pack_templates
set title = '우리 아직 통할까?',
    is_active = true,
    updated_at = clock_timestamp()
where id = '11111111-1111-4111-8111-111111111111'
  and slug = 'old-friend';

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
values (
  '13131313-1313-4313-8313-131313131313',
  'coworker',
  '같이 일할 때 나는?',
  'coworker',
  'low',
  true
)
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
values (
  '17171717-1717-4717-8717-171717171717',
  '13131313-1313-4313-8313-131313131313',
  'coworker-v1'
)
on conflict (id) do nothing;

insert into public.pack_cards (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
values
  ('17171717-1717-4717-8717-171717171717', 'unclear-task', 1, '업무가 애매하게 주어지면 나는?', '업무가 애매하게 주어지면 이 사람은?', '먼저 기준을 질문한다', '가능한 안을 만들어 확인한다', true),
  ('17171717-1717-4717-8717-171717171717', 'meeting', 2, '회의에서 의견이 생기면 나는?', '회의에서 의견이 생기면 이 사람은?', '떠오른 때 바로 말한다', '정리한 뒤 차례에 말한다', false),
  ('17171717-1717-4717-8717-171717171717', 'focus', 3, '집중이 필요할 때 나는?', '집중이 필요할 때 이 사람은?', '주변을 정돈하고 몰입한다', '장소나 일을 바꿔 리듬을 만든다', false),
  ('17171717-1717-4717-8717-171717171717', 'deadline', 4, '마감이 있는 일을 할 때 나는?', '마감이 있는 일을 할 때 이 사람은?', '여유 있게 나눠 진행한다', '집중할 시간을 잡아 한 번에 진행한다', false),
  ('17171717-1717-4717-8717-171717171717', 'feedback', 5, '피드백을 받으면 나는?', '피드백을 받으면 이 사람은?', '바로 질문하며 이해한다', '혼자 정리한 뒤 반영한다', false),
  ('17171717-1717-4717-8717-171717171717', 'new-colleague', 6, '새 동료와 가까워질 때 나는 먼저?', '새 동료와 가까워질 때 이 사람은 먼저?', '말을 걸고 함께 다닌다', '업무 중 필요한 순간을 돕는다', false),
  ('17171717-1717-4717-8717-171717171717', 'break', 7, '점심이나 쉬는 시간에 나는?', '점심이나 쉬는 시간에 이 사람은?', '동료와 함께 쉬며 충전한다', '혼자만의 시간으로 충전한다', false),
  ('17171717-1717-4717-8717-171717171717', 'plan-change', 8, '계획이 갑자기 바뀌면 나는 먼저?', '계획이 갑자기 바뀌면 이 사람은 먼저?', '새 우선순위를 정한다', '영향받는 사람과 일을 확인한다', false),
  ('17171717-1717-4717-8717-171717171717', 'ask-help', 9, '동료의 도움이 필요할 때 나는?', '동료의 도움이 필요할 때 이 사람은?', '상황을 설명하고 바로 요청한다', '내가 해본 뒤 막힌 부분을 묻는다', false),
  ('17171717-1717-4717-8717-171717171717', 'share-work', 10, '일을 마친 뒤 나는?', '일을 마친 뒤 이 사람은?', '바로 공유하고 의견을 받는다', '한 번 더 점검한 뒤 공유한다', false)
on conflict (pack_version_id, id) do nothing;

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
values (
  '12121212-1212-4212-8212-121212121212',
  'first-impression',
  '나, 첫눈에 어땠어?',
  'new_connection',
  'low',
  true
)
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
values (
  '16161616-1616-4616-8616-161616161616',
  '12121212-1212-4212-8212-121212121212',
  'first-impression-v1'
)
on conflict (id) do nothing;

insert into public.pack_cards (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
values
  ('16161616-1616-4616-8616-161616161616', 'first-move', 1, '처음 만난 자리에서 나는?', '처음 만난 자리에서 이 사람은?', '먼저 말을 건다', '상대가 말을 걸면 자연스럽게 이어 간다', true),
  ('16161616-1616-4616-8616-161616161616', 'first-topic', 2, '처음 대화를 시작할 때 나는?', '처음 대화를 시작할 때 이 사람은?', '공통점을 먼저 찾는다', '지금 상황에서 소재를 찾는다', false),
  ('16161616-1616-4616-8616-161616161616', 'group-entry', 3, '낯선 사람들이 모인 자리에 가면 나는?', '낯선 사람들이 모인 자리에 가면 이 사람은?', '여러 사람에게 두루 인사한다', '한두 사람과 먼저 친해진다', false),
  ('16161616-1616-4616-8616-161616161616', 'silence', 4, '대화가 잠시 끊기면 나는?', '대화가 잠시 끊기면 이 사람은?', '새 화제를 꺼낸다', '잠깐의 침묵도 편하게 둔다', false),
  ('16161616-1616-4616-8616-161616161616', 'interest', 5, '상대 이야기에 관심을 보일 때 나는 주로?', '상대 이야기에 관심을 보일 때 이 사람은 주로?', '표정과 맞장구로 보여 준다', '이어지는 질문으로 보여 준다', false),
  ('16161616-1616-4616-8616-161616161616', 'humor', 6, '처음 만난 자리에서 웃음이 생길 때 나는 주로?', '처음 만난 자리에서 웃음이 생길 때 이 사람은 주로?', '먼저 농담을 꺼낸다', '상대 농담에 크게 반응한다', false),
  ('16161616-1616-4616-8616-161616161616', 'warm-up', 7, '새로운 사람과 가까워질 때 나는?', '새로운 사람과 가까워질 때 이 사람은?', '짧은 시간에도 금방 편해진다', '몇 번 만나며 천천히 편해진다', false),
  ('16161616-1616-4616-8616-161616161616', 'meet-again', 8, '처음 만난 사람을 다시 만나면 나는 먼저?', '처음 만난 사람을 다시 만나면 이 사람은 먼저?', '전에 나눈 이야기를 꺼낸다', '새로운 근황을 묻는다', false),
  ('16161616-1616-4616-8616-161616161616', 'follow-up', 9, '처음 만난 뒤 연락할 때 나는?', '처음 만난 뒤 연락할 때 이 사람은?', '먼저 짧게 안부를 보낸다', '다음에 만날 계기가 생기면 연락한다', false),
  ('16161616-1616-4616-8616-161616161616', 'outfit', 10, '처음 만나는 날 옷을 고를 때 나는?', '처음 만나는 날 옷을 고를 때 이 사람은?', '눈에 띄는 포인트를 더한다', '익숙하고 편한 옷을 고른다', false)
on conflict (pack_version_id, id) do nothing;

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
values (
  '14141414-1414-4414-8414-141414141414',
  'honest-self',
  '가까운 사람만 아는 나',
  'close_relationship',
  'medium',
  true
)
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
values (
  '18181818-1818-4818-8818-181818181818',
  '14141414-1414-4414-8414-141414141414',
  'honest-self-v1'
)
on conflict (id) do nothing;

insert into public.pack_cards (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
values
  ('18181818-1818-4818-8818-181818181818', 'busy-mind', 1, '마음이 복잡한 날 나는?', '마음이 복잡한 날 이 사람은?', '누군가에게 말하며 정리한다', '혼자 시간을 보내며 정리한다', true),
  ('18181818-1818-4818-8818-181818181818', 'compliment', 2, '칭찬을 들으면 나는?', '칭찬을 들으면 이 사람은?', '기분 좋은 티가 바로 난다', '쑥스러워도 조용히 받아들인다', false),
  ('18181818-1818-4818-8818-181818181818', 'big-choice', 3, '중요한 선택 앞에서 나는?', '중요한 선택 앞에서 이 사람은?', '주변 의견을 들어 본다', '내 기준부터 정리한다', false),
  ('18181818-1818-4818-8818-181818181818', 'letdown', 4, '기대했던 일이 어긋난 직후 나는?', '기대했던 일이 어긋난 직후 이 사람은?', '아쉬움을 말로 표현한다', '다음 방법부터 찾는다', false),
  ('18181818-1818-4818-8818-181818181818', 'misunderstood', 5, '오해받았다고 느끼면 나는?', '오해받았다고 느끼면 이 사람은?', '그 자리에서 바로 풀려고 한다', '감정이 가라앉은 뒤 이야기한다', false),
  ('18181818-1818-4818-8818-181818181818', 'free-day', 6, '아무 약속 없는 하루가 생기면 나는?', '아무 약속 없는 하루가 생기면 이 사람은?', '하고 싶던 일을 찾아 움직인다', '쉬면서 그날 기분을 따른다', false),
  ('18181818-1818-4818-8818-181818181818', 'need-help', 7, '도움이 필요할 때 나는?', '도움이 필요할 때 이 사람은?', '구체적으로 부탁한다', '혼자 해본 뒤 부탁한다', false),
  ('18181818-1818-4818-8818-181818181818', 'new-start', 8, '새로운 일을 시작할 때 나는?', '새로운 일을 시작할 때 이 사람은?', '일단 해보며 감을 잡는다', '충분히 알아본 뒤 시작한다', false),
  ('18181818-1818-4818-8818-181818181818', 'attention', 9, '사람들이 나를 주목하면 나는?', '사람들이 이 사람을 주목하면?', '그 분위기를 즐기는 편이다', '조금 뒤로 물러나는 편이다', false),
  ('18181818-1818-4818-8818-181818181818', 'affection', 10, '좋아하는 사람에게 마음을 표현할 때 나는 주로?', '좋아하는 사람에게 이 사람은 마음을 주로 어떻게 표현할까?', '말로 직접 전한다', '행동으로 자연스럽게 보여 준다', false)
on conflict (pack_version_id, id) do nothing;

do $function$
begin
  if not exists (
    select 1 from public.pack_versions
    where id = '16161616-1616-4616-8616-161616161616'
      and published_at is not null
  ) then
    perform public.publish_pack_version('16161616-1616-4616-8616-161616161616');
  end if;
  if not exists (
    select 1 from public.pack_versions
    where id = '17171717-1717-4717-8717-171717171717'
      and published_at is not null
  ) then
    perform public.publish_pack_version('17171717-1717-4717-8717-171717171717');
  end if;
  if not exists (
    select 1 from public.pack_versions
    where id = '18181818-1818-4818-8818-181818181818'
      and published_at is not null
  ) then
    perform public.publish_pack_version('18181818-1818-4818-8818-181818181818');
  end if;
end
$function$;

create or replace function public.get_visitor_response_pack_metadata(
  p_response_id uuid,
  p_session_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_metadata jsonb;
begin
  if p_response_id is null
    or p_session_hash is null
    or octet_length(p_session_hash) <> 32
  then
    raise exception using errcode = '22023', message = 'invalid visitor response metadata input';
  end if;

  select jsonb_build_object(
    'packSlug', template.slug,
    'packVersion', version.version,
    'packTitle', template.title
  )
  into v_metadata
  from public.visitor_responses as response
  join public.pack_versions as version
    on version.id = response.pack_version_id
  join public.pack_templates as template
    on template.id = version.template_id
  where response.id = p_response_id
    and response.session_token_hash = p_session_hash
    and response.status in ('draft', 'submitted')
    and response.session_expires_at > clock_timestamp();

  if not found then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  return jsonb_build_object(
    'outcome', 'authorized',
    'metadata', v_metadata
  );
end
$function$;

grant create on schema public to gyeop_internal_rpc;
grant gyeop_internal_rpc to postgres;
alter function public.get_visitor_response_pack_metadata(uuid, bytea)
  owner to gyeop_internal_rpc;
revoke all on function public.get_visitor_response_pack_metadata(uuid, bytea)
  from public, anon, authenticated, service_role;
grant execute on function public.get_visitor_response_pack_metadata(uuid, bytea)
  to service_role;
revoke create on schema public from gyeop_internal_rpc;
revoke gyeop_internal_rpc from postgres;

commit;
