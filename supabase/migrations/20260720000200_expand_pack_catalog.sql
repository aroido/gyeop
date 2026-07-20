-- Generated from content/packs/*-v1.json by scripts/render-pack-seed.mjs.
-- Do not edit pack rows directly; update manifests and regenerate.
begin;

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '630c20b9-460b-443b-b74b-865d1dfdf5fb'::uuid,
    'after-work',
    '퇴근 후 본캐',
    'coworker',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '12b7e787-ab51-46e6-96df-badd68008c34'::uuid,
    '630c20b9-460b-443b-b74b-865d1dfdf5fb'::uuid,
    'after-work-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '630c20b9-460b-443b-b74b-865d1dfdf5fb'
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
select seed.*
from (
  values
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'clock-out', 1, '할 일을 마친 직후 나는?', '할 일을 마친 직후 이 사람은?', '바로 다음 즐거움으로 전환한다', '잠깐 멍하니 속도를 늦춘다', true),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'route-home', 2, '집에 가는 길 나는?', '집에 가는 길 이 사람은?', '지름길로 빨리 간다', '기분 전환할 길을 고른다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'dinner', 3, '저녁을 고를 때 나는?', '저녁을 고를 때 이 사람은?', '간단하게 바로 해결한다', '먹고 싶은 걸 찾아 챙긴다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'decompress', 4, '하루를 정리하는 방식은?', '이 사람이 하루를 정리하는 방식은?', '누군가와 이야기하며 푼다', '혼자 좋아하는 걸 하며 푼다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'message-after', 5, '퇴근 후 연락이 오면 나는?', '퇴근 후 연락이 오면 이 사람은?', '가볍게 바로 답한다', '내 시간 뒤에 답한다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'energy', 6, '저녁 에너지가 남아 있으면 나는?', '저녁 에너지가 남아 있으면 이 사람은?', '밖에서 한 가지 더 한다', '내일을 위해 아껴 둔다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'weeknight', 7, '평일 저녁 약속은 나는?', '평일 저녁 약속은 이 사람은?', '좋은 사람이라면 반갑다', '주말에 보는 게 더 편하다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'hobby', 8, '퇴근 후 취미를 할 때 나는?', '퇴근 후 취미를 할 때 이 사람은?', '정해 둔 루틴을 따른다', '그날 끌리는 걸 고른다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'tomorrow', 9, '잠들기 전 나는?', '잠들기 전 이 사람은?', '내일 준비를 조금 한다', '오늘을 완전히 끝낸다', false),
    ('12b7e787-ab51-46e6-96df-badd68008c34'::uuid, 'weekend-countdown', 10, '주말을 기다리는 방식은?', '이 사람이 주말을 기다리는 방식은?', '하고 싶은 계획을 세운다', '그날까지 지금에 집중한다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '12b7e787-ab51-46e6-96df-badd68008c34'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('12b7e787-ab51-46e6-96df-badd68008c34')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '12b7e787-ab51-46e6-96df-badd68008c34'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    'f16e20a8-f2bd-4799-af68-689bbc36ebd5'::uuid,
    'algorithm-mirror',
    '알고리즘이 들킨 날',
    'new_connection',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '42653171-894f-428b-9151-ed3281fef46e'::uuid,
    'f16e20a8-f2bd-4799-af68-689bbc36ebd5'::uuid,
    'algorithm-mirror-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = 'f16e20a8-f2bd-4799-af68-689bbc36ebd5'
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
select seed.*
from (
  values
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'feed-clue', 1, '내 피드가 나를 너무 잘 안다고 느끼면 나는?', '이 사람의 피드가 이 사람을 잘 안다고 느끼면?', '추천을 더 깊게 따라간다', '일부러 다른 걸 찾아본다', true),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'save-first', 2, '나중에 볼 콘텐츠를 발견하면 나는?', '나중에 볼 콘텐츠를 발견하면 이 사람은?', '바로 저장해 둔다', '기억날 때 다시 찾는다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'rabbit-hole', 3, '하나를 보다가 다른 주제로 새면 나는?', '하나를 보다가 다른 주제로 새면 이 사람은?', '끝까지 새 길을 탐험한다', '원래 보려던 곳으로 돌아온다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'share-find', 4, '내 취향 저격 콘텐츠를 보면 나는?', '내 취향 저격 콘텐츠를 보면 이 사람은?', '누군가에게 바로 보낸다', '혼자 여러 번 다시 본다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'trend-check', 5, '다들 하는 유행을 보면 나는?', '다들 하는 유행을 보면 이 사람은?', '왜 뜨는지 한 번 해본다', '나한테 맞는지부터 본다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'recommendation', 6, '추천을 받을 때 나는?', '추천을 받을 때 이 사람은?', '비슷한 걸 더 찾아본다', '정반대도 같이 비교한다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'comment-dive', 7, '흥미로운 영상 아래에서 나는?', '흥미로운 영상 아래에서 이 사람은?', '댓글 반응까지 읽는다', '영상만 보고 다음으로 간다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'old-favorite', 8, '예전에 좋아한 걸 다시 발견하면 나는?', '예전에 좋아한 걸 다시 발견하면 이 사람은?', '그때 기록을 다시 찾아본다', '지금의 취향과 비교한다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'search-style', 9, '궁금한 게 생기면 나는?', '궁금한 게 생기면 이 사람은?', '검색어를 구체적으로 만든다', '대충 넣고 흐름을 따라간다', false),
    ('42653171-894f-428b-9151-ed3281fef46e'::uuid, 'recommend-to-me', 10, '누가 취향을 추천해 달라 하면 나는?', '누가 취향을 추천해 달라 하면 이 사람은?', '내 최애 하나를 강하게 민다', '상대 취향부터 물어본다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '42653171-894f-428b-9151-ed3281fef46e'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('42653171-894f-428b-9151-ed3281fef46e')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '42653171-894f-428b-9151-ed3281fef46e'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '75ccfdf6-bf0d-4fb8-b8a4-a8cb5f933701'::uuid,
    'camera-roll',
    '최근 사진 20장',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid,
    '75ccfdf6-bf0d-4fb8-b8a4-a8cb5f933701'::uuid,
    'camera-roll-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '75ccfdf6-bf0d-4fb8-b8a4-a8cb5f933701'
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
select seed.*
from (
  values
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'first-photo', 1, '재밌는 순간이 오면 나는?', '재밌는 순간이 오면 이 사람은?', '바로 사진부터 남긴다', '먼저 그 순간을 즐긴다', true),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'food-photo', 2, '맛있는 음식 앞에서 나는?', '맛있는 음식 앞에서 이 사람은?', '예쁘게 찍고 먹는다', '따뜻할 때 먼저 먹는다', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'selfie', 3, '내 사진을 찍을 때 나는?', '이 사람 사진을 찍을 때 이 사람은?', '여러 장 중 마음에 드는 걸 고른다', '한 장의 자연스러운 컷을 남긴다', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'friend-photo', 4, '친구 사진을 찍어 줄 때 나는?', '친구 사진을 찍어 줄 때 이 사람은?', '각도와 구도를 신경 쓴다', '재밌는 표정을 먼저 끌어낸다', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'cleanup', 5, '사진이 쌓이면 나는?', '사진이 쌓이면 이 사람은?', '틈틈이 정리한다', '필요할 때 찾아본다', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'old-album', 6, '예전 사진을 보면 나는?', '예전 사진을 보면 이 사람은?', '그날 이야기를 떠올린다', '그때의 분위기를 다시 느낀다', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'share-photo', 7, '함께 찍은 사진은 나는?', '함께 찍은 사진은 이 사람은?', '바로 보내서 같이 본다', '골라서 나중에 보낸다', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'screenshot', 8, '스크린샷을 찍는 이유는 주로?', '이 사람이 스크린샷을 찍는 이유는 주로?', '나중에 다시 보려고', '누군가에게 보여 주려고', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'landscape', 9, '풍경 앞에서 나는?', '풍경 앞에서 이 사람은?', '멋진 화면을 만들고 싶다', '눈으로 오래 기억하고 싶다', false),
    ('710f5a92-aae6-4407-85f6-ea38d1962e90'::uuid, 'favorite', 10, '좋아하는 사진 한 장을 고를 때 나는?', '이 사람이 좋아하는 사진 한 장을 고를 때는?', '사람의 표정을 본다', '그날의 이야기를 본다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '710f5a92-aae6-4407-85f6-ea38d1962e90'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('710f5a92-aae6-4407-85f6-ea38d1962e90')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '710f5a92-aae6-4407-85f6-ea38d1962e90'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '0a9b7ee3-9556-448f-8719-329094601b1a'::uuid,
    'comment-section',
    '내적 댓글창',
    'close_relationship',
    'medium',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    'f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid,
    '0a9b7ee3-9556-448f-8719-329094601b1a'::uuid,
    'comment-section-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '0a9b7ee3-9556-448f-8719-329094601b1a'
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
select seed.*
from (
  values
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'surprise-thought', 1, '뜻밖의 일이 생기면 내 머릿속은?', '뜻밖의 일이 생기면 이 사람 머릿속은?', '말로 바로 나오는 편이다', '속으로 먼저 여러 번 생각한다', true),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'replay', 2, '대화가 끝난 뒤 나는?', '대화가 끝난 뒤 이 사람은?', '재밌던 말을 다시 떠올린다', '다음에 할 말을 생각한다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'awkward-moment', 3, '민망한 순간이 오면 나는?', '민망한 순간이 오면 이 사람은?', '웃으며 바로 넘긴다', '혼자 조금 더 곱씹는다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'idea', 4, '좋은 생각이 떠오르면 나는?', '좋은 생각이 떠오르면 이 사람은?', '누군가에게 말하며 키운다', '혼자 메모하며 다듬는다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'choice-voice', 5, '결정 앞에서 내 마음은?', '결정 앞에서 이 사람 마음은?', '응원하는 쪽이 더 크다', '걱정하는 쪽이 더 크다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'quiet', 6, '조용한 시간에 나는?', '조용한 시간에 이 사람은?', '생각이 더 선명해진다', '생각도 함께 쉬어 간다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'mistake', 7, '실수를 알아차리면 나는?', '실수를 알아차리면 이 사람은?', '바로 고칠 방법을 찾는다', '왜 그랬는지 먼저 이해한다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'compliment-thought', 8, '좋은 말을 들은 뒤 나는?', '좋은 말을 들은 뒤 이 사람은?', '그 말이 오래 떠오른다', '그 자리에서 힘을 얻는다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'plan-thought', 9, '새 계획을 세울 때 나는?', '새 계획을 세울 때 이 사람은?', '잘될 장면을 먼저 그린다', '막힐 부분을 먼저 살핀다', false),
    ('f68fc15e-4b60-41ee-a22e-6788b12a2f3e'::uuid, 'share-thought', 10, '마음에 걸리는 생각이 있으면 나는?', '마음에 걸리는 생각이 있으면 이 사람은?', '믿는 사람에게 말해 본다', '시간을 두고 혼자 정리한다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'f68fc15e-4b60-41ee-a22e-6788b12a2f3e'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('f68fc15e-4b60-41ee-a22e-6788b12a2f3e')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'f68fc15e-4b60-41ee-a22e-6788b12a2f3e'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    'e517cc31-8a8c-4156-a2ae-7e8ddb3f6809'::uuid,
    'compliment-receipt',
    '칭찬 영수증',
    'close_relationship',
    'medium',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid,
    'e517cc31-8a8c-4156-a2ae-7e8ddb3f6809'::uuid,
    'compliment-receipt-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = 'e517cc31-8a8c-4156-a2ae-7e8ddb3f6809'
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
select seed.*
from (
  values
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'receive', 1, '칭찬을 들으면 나는?', '칭찬을 들으면 이 사람은?', '기분 좋은 티가 바로 난다', '쑥스러워도 조용히 기억한다', true),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'give', 2, '좋은 점을 발견하면 나는?', '좋은 점을 발견하면 이 사람은?', '그 자리에서 바로 말한다', '딱 맞는 순간까지 아껴 둔다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'specific', 3, '누군가를 칭찬할 때 나는?', '이 사람이 누군가를 칭찬할 때는?', '구체적인 장면을 말한다', '느낀 마음을 크게 전한다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'achievement', 4, '내가 잘한 일을 들으면 나는?', '이 사람이 잘한 일을 들으면 이 사람은?', '과정을 먼저 이야기한다', '도와준 사람을 먼저 말한다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'awkward', 5, '갑자기 다정한 말을 들으면 나는?', '갑자기 다정한 말을 들으면 이 사람은?', '장난으로 받아친다', '고맙다고 그대로 받는다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'encourage', 6, '힘들어 보이는 사람에게 나는?', '힘들어 보이는 사람에게 이 사람은?', '실질적인 도움을 제안한다', '먼저 마음을 알아준다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'small-win', 7, '작은 성공이 생기면 나는?', '작은 성공이 생기면 이 사람은?', '누군가에게 바로 알린다', '혼자 뿌듯해하며 쌓아 둔다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'feedback', 8, '좋은 피드백을 받으면 나는?', '좋은 피드백을 받으면 이 사람은?', '다음에도 살리고 싶어진다', '왜 좋았는지 분석해 본다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'support', 9, '친구가 자신 없어 하면 나는?', '친구가 자신 없어 하면 이 사람은?', '해낸 장면을 떠올려 준다', '지금 필요한 걸 같이 찾는다', false),
    ('57c8bcbb-d753-41b3-85bd-b343886aac18'::uuid, 'memory', 10, '오래 남는 말은 내게?', '이 사람에게 오래 남는 말은?', '나를 정확히 봐 준 말', '용기를 건네 준 말', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '57c8bcbb-d753-41b3-85bd-b343886aac18'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('57c8bcbb-d753-41b3-85bd-b343886aac18')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '57c8bcbb-d753-41b3-85bd-b343886aac18'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '13131313-1313-4313-8313-131313131313'::uuid,
    'coworker',
    '퇴근 전의 우리',
    'coworker',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '17171717-1717-4717-8717-171717171717'::uuid,
    '13131313-1313-4313-8313-131313131313'::uuid,
    'coworker-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '13131313-1313-4313-8313-131313131313'
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
select seed.*
from (
  values
    ('17171717-1717-4717-8717-171717171717'::uuid, 'unclear-task', 1, '업무가 애매하게 주어지면 나는?', '업무가 애매하게 주어지면 이 사람은?', '먼저 기준을 질문한다', '가능한 안을 만들어 확인한다', true),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'meeting', 2, '회의에서 의견이 생기면 나는?', '회의에서 의견이 생기면 이 사람은?', '떠오른 때 바로 말한다', '정리한 뒤 차례에 말한다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'focus', 3, '집중이 필요할 때 나는?', '집중이 필요할 때 이 사람은?', '주변을 정돈하고 몰입한다', '장소나 일을 바꿔 리듬을 만든다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'deadline', 4, '마감이 있는 일을 할 때 나는?', '마감이 있는 일을 할 때 이 사람은?', '여유 있게 나눠 진행한다', '집중할 시간을 잡아 한 번에 진행한다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'feedback', 5, '피드백을 받으면 나는?', '피드백을 받으면 이 사람은?', '바로 질문하며 이해한다', '혼자 정리한 뒤 반영한다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'new-colleague', 6, '새 동료와 가까워질 때 나는 먼저?', '새 동료와 가까워질 때 이 사람은 먼저?', '말을 걸고 함께 다닌다', '업무 중 필요한 순간을 돕는다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'break', 7, '점심이나 쉬는 시간에 나는?', '점심이나 쉬는 시간에 이 사람은?', '동료와 함께 쉬며 충전한다', '혼자만의 시간으로 충전한다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'plan-change', 8, '계획이 갑자기 바뀌면 나는 먼저?', '계획이 갑자기 바뀌면 이 사람은 먼저?', '새 우선순위를 정한다', '영향받는 사람과 일을 확인한다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'ask-help', 9, '동료의 도움이 필요할 때 나는?', '동료의 도움이 필요할 때 이 사람은?', '상황을 설명하고 바로 요청한다', '내가 해본 뒤 막힌 부분을 묻는다', false),
    ('17171717-1717-4717-8717-171717171717'::uuid, 'share-work', 10, '일을 마친 뒤 나는?', '일을 마친 뒤 이 사람은?', '바로 공유하고 의견을 받는다', '한 번 더 점검한 뒤 공유한다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '17171717-1717-4717-8717-171717171717'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('17171717-1717-4717-8717-171717171717')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '17171717-1717-4717-8717-171717171717'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '15299196-d3bf-4f89-be1e-bcc1ea69a904'::uuid,
    'deadline-mode',
    '마감 전의 나',
    'coworker',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '71e68c95-f5f8-478e-81fa-9999168136aa'::uuid,
    '15299196-d3bf-4f89-be1e-bcc1ea69a904'::uuid,
    'deadline-mode-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '15299196-d3bf-4f89-be1e-bcc1ea69a904'
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
select seed.*
from (
  values
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'start-point', 1, '마감이 잡히면 나는?', '마감이 잡히면 이 사람은?', '바로 첫 조각부터 시작한다', '전체 그림을 잡은 뒤 움직인다', true),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'calendar', 2, '할 일이 많아지면 나는?', '할 일이 많아지면 이 사람은?', '일정을 눈에 보이게 나눈다', '급한 순서대로 바로 처리한다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'focus-place', 3, '집중이 안 될 때 나는?', '집중이 안 될 때 이 사람은?', '환경을 바꿔 다시 시작한다', '작은 목표를 정해 버틴다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'first-draft', 4, '처음 결과물을 만들 때 나는?', '처음 결과물을 만들 때 이 사람은?', '일단 빠르게 초안을 낸다', '기준에 맞게 다듬어 시작한다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'help-signal', 5, '막히는 일이 생기면 나는?', '막히는 일이 생기면 이 사람은?', '일찍 도움을 요청한다', '가능한 데까지 혼자 풀어본다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'break-time', 6, '바쁜 중간 쉬는 시간 나는?', '바쁜 중간 쉬는 시간 이 사람은?', '짧게라도 몸을 움직인다', '흐름이 끊기지 않게 계속 간다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'feedback-time', 7, '중간 피드백을 받을 때 나는?', '중간 피드백을 받을 때 이 사람은?', '바로 공유해 방향을 맞춘다', '한 번 더 완성도를 올려 공유한다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'deadline-night', 8, '마감 직전 나는?', '마감 직전 이 사람은?', '우선 제출 가능한 상태를 만든다', '끝까지 디테일을 다듬는다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'done', 9, '일을 끝낸 뒤 나는?', '일을 끝낸 뒤 이 사람은?', '바로 다음 일을 정리한다', '잠깐 성취감을 즐긴다', false),
    ('71e68c95-f5f8-478e-81fa-9999168136aa'::uuid, 'rematch', 10, '다음번 같은 일이 오면 나는?', '다음번 같은 일이 오면 이 사람은?', '이번의 방식을 반복한다', '새 방법을 하나 바꿔 본다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '71e68c95-f5f8-478e-81fa-9999168136aa'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('71e68c95-f5f8-478e-81fa-9999168136aa')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '71e68c95-f5f8-478e-81fa-9999168136aa'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    'dec475db-00a1-43ea-91c5-75d32259fd6b'::uuid,
    'decision-spiral',
    '결정은 내일의 나에게',
    'close_relationship',
    'medium',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    'c013892b-5ebb-42e0-8926-60edecade39d'::uuid,
    'dec475db-00a1-43ea-91c5-75d32259fd6b'::uuid,
    'decision-spiral-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = 'dec475db-00a1-43ea-91c5-75d32259fd6b'
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
select seed.*
from (
  values
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'menu', 1, '고를 게 너무 많을 때 나는?', '고를 게 너무 많을 때 이 사람은?', '기준을 하나 정해 빠르게 고른다', '후회 없게 끝까지 비교한다', true),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'recommendation', 2, '추천을 받으면 나는?', '추천을 받으면 이 사람은?', '믿고 바로 선택한다', '내 기준으로 한 번 더 확인한다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'big-choice', 3, '큰 결정을 앞두고 나는?', '큰 결정을 앞두고 이 사람은?', '사람들의 의견을 들어 본다', '혼자 생각할 시간을 먼저 갖는다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'coin-flip', 4, '둘 중 하나를 못 고르면 나는?', '둘 중 하나를 못 고르면 이 사람은?', '재미있는 방식으로 정한다', '하루쯤 더 두고 본다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'risk', 5, '새로운 선택 앞에서 나는?', '새로운 선택 앞에서 이 사람은?', '해보면서 배우는 쪽을 고른다', '안전한 기준점을 먼저 찾는다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'purchase', 6, '사고 싶은 게 생기면 나는?', '사고 싶은 게 생기면 이 사람은?', '필요한 이유를 적어 본다', '며칠 뒤에도 생각나는지 본다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'plan-change', 7, '정한 계획을 바꿀 때 나는?', '정한 계획을 바꿀 때 이 사람은?', '더 나은 이유가 있으면 바꾼다', '처음 정한 약속을 지킨다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'advice', 8, '누가 선택을 물어보면 나는?', '누가 선택을 물어보면 이 사람은?', '내가 고를 답을 말해 준다', '상대 기준을 같이 정리한다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'regret', 9, '선택 뒤 아쉬움이 남으면 나는?', '선택 뒤 아쉬움이 남으면 이 사람은?', '다음 선택의 기준으로 쓴다', '좋았던 점을 먼저 찾는다', false),
    ('c013892b-5ebb-42e0-8926-60edecade39d'::uuid, 'easy-day', 10, '결정 피로가 쌓인 날 나는?', '결정 피로가 쌓인 날 이 사람은?', '누군가가 정해 주면 편하다', '아무것도 정하지 않고 싶다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'c013892b-5ebb-42e0-8926-60edecade39d'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('c013892b-5ebb-42e0-8926-60edecade39d')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'c013892b-5ebb-42e0-8926-60edecade39d'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '4c3f9b04-48a2-4dda-a2f9-bfcc101a9565'::uuid,
    'emoji-subtitles',
    '이모지 자막 켜기',
    'new_connection',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    'bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid,
    '4c3f9b04-48a2-4dda-a2f9-bfcc101a9565'::uuid,
    'emoji-subtitles-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '4c3f9b04-48a2-4dda-a2f9-bfcc101a9565'
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
select seed.*
from (
  values
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'reaction-style', 1, '말보다 반응이 먼저 나올 때 나는?', '말보다 반응이 먼저 나올 때 이 사람은?', '이모지나 짤로 답한다', '짧은 문장으로 바로 말한다', true),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'funny-post', 2, '웃긴 걸 발견하면 나는?', '웃긴 걸 발견하면 이 사람은?', '딱 생각나는 사람에게 보낸다', '내 저장 목록에 넣어 둔다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'tone', 3, '장난을 칠 때 나는?', '장난을 칠 때 이 사람은?', '표정이나 이모지를 덧붙인다', '말투만으로 전달한다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'inside-reference', 4, '우리만 아는 표현이 생기면 나는?', '우리만 아는 표현이 생기면 이 사람은?', '더 자주 써서 키운다', '결정적일 때만 꺼낸다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'misread', 5, '내 말이 오해될 것 같으면 나는?', '이 사람 말이 오해될 것 같으면 이 사람은?', '설명을 한 줄 더 붙인다', '다음 대화에서 자연스럽게 푼다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'gif-choice', 6, '반응 하나를 고를 때 나는?', '반응 하나를 고를 때 이 사람은?', '정확하게 맞는 걸 찾는다', '가장 빠르게 떠오른 걸 보낸다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'new-slang', 7, '새로운 말투를 들으면 나는?', '새로운 말투를 들으면 이 사람은?', '재밌으면 바로 써 본다', '어울릴 때까지 지켜본다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'laughter', 8, '텍스트로 웃음을 표현할 때 나는?', '텍스트로 웃음을 표현할 때 이 사람은?', '크고 분명하게 반응한다', '조용히 한 마디를 남긴다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'reply-context', 9, '대화 맥락이 길어지면 나는?', '대화 맥락이 길어지면 이 사람은?', '앞의 말을 인용해 답한다', '핵심만 새로 정리한다', false),
    ('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'::uuid, 'translate', 10, '누가 내 반응을 못 알아들으면 나는?', '누가 이 사람 반응을 못 알아들으면 이 사람은?', '왜 웃긴지 설명해 준다', '다른 예시를 가져온다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'bdc9dee0-d1c7-4e2d-9ed4-347a6e2118fa'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '12121212-1212-4212-8212-121212121212'::uuid,
    'first-impression',
    '첫 장면, 네 버전',
    'new_connection',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '16161616-1616-4616-8616-161616161616'::uuid,
    '12121212-1212-4212-8212-121212121212'::uuid,
    'first-impression-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '12121212-1212-4212-8212-121212121212'
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
select seed.*
from (
  values
    ('16161616-1616-4616-8616-161616161616'::uuid, 'first-move', 1, '처음 만난 자리에서 나는?', '처음 만난 자리에서 이 사람은?', '먼저 말을 건다', '상대가 말을 걸면 자연스럽게 이어 간다', true),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'first-topic', 2, '처음 대화를 시작할 때 나는?', '처음 대화를 시작할 때 이 사람은?', '공통점을 먼저 찾는다', '지금 상황에서 소재를 찾는다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'group-entry', 3, '낯선 사람들이 모인 자리에 가면 나는?', '낯선 사람들이 모인 자리에 가면 이 사람은?', '여러 사람에게 두루 인사한다', '한두 사람과 먼저 친해진다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'silence', 4, '대화가 잠시 끊기면 나는?', '대화가 잠시 끊기면 이 사람은?', '새 화제를 꺼낸다', '잠깐의 침묵도 편하게 둔다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'interest', 5, '상대 이야기에 관심을 보일 때 나는 주로?', '상대 이야기에 관심을 보일 때 이 사람은 주로?', '표정과 맞장구로 보여 준다', '이어지는 질문으로 보여 준다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'humor', 6, '처음 만난 자리에서 웃음이 생길 때 나는 주로?', '처음 만난 자리에서 웃음이 생길 때 이 사람은 주로?', '먼저 농담을 꺼낸다', '상대 농담에 크게 반응한다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'warm-up', 7, '새로운 사람과 가까워질 때 나는?', '새로운 사람과 가까워질 때 이 사람은?', '짧은 시간에도 금방 편해진다', '몇 번 만나며 천천히 편해진다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'meet-again', 8, '처음 만난 사람을 다시 만나면 나는 먼저?', '처음 만난 사람을 다시 만나면 이 사람은 먼저?', '전에 나눈 이야기를 꺼낸다', '새로운 근황을 묻는다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'follow-up', 9, '처음 만난 뒤 연락할 때 나는?', '처음 만난 뒤 연락할 때 이 사람은?', '먼저 짧게 안부를 보낸다', '다음에 만날 계기가 생기면 연락한다', false),
    ('16161616-1616-4616-8616-161616161616'::uuid, 'outfit', 10, '처음 만나는 날 옷을 고를 때 나는?', '처음 만나는 날 옷을 고를 때 이 사람은?', '눈에 띄는 포인트를 더한다', '익숙하고 편한 옷을 고른다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '16161616-1616-4616-8616-161616161616'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('16161616-1616-4616-8616-161616161616')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '16161616-1616-4616-8616-161616161616'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '2cb89681-7c7b-42c4-b1f3-4700d5c17cc0'::uuid,
    'friend-fusion',
    '우리 둘이 섞인다면',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid,
    '2cb89681-7c7b-42c4-b1f3-4700d5c17cc0'::uuid,
    'friend-fusion-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '2cb89681-7c7b-42c4-b1f3-4700d5c17cc0'
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
select seed.*
from (
  values
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'combined-plan', 1, '친구와 내가 한 팀이면 나는?', '친구와 이 사람이 한 팀이면 이 사람은?', '시작을 끌어가는 역할', '마무리를 챙기는 역할', true),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'trip-team', 2, '여행을 같이 준비하면 나는?', '여행을 같이 준비하면 이 사람은?', '가고 싶은 곳을 모은다', '현실적인 동선을 만든다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'game-team', 3, '게임이나 놀이에서 나는?', '게임이나 놀이에서 이 사람은?', '규칙을 빨리 파악한다', '분위기를 더 재밌게 만든다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'food-team', 4, '메뉴를 같이 고르면 나는?', '메뉴를 같이 고르면 이 사람은?', '후보를 여러 개 던진다', '마지막 선택을 정리한다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'problem-team', 5, '갑작스러운 문제가 생기면 나는?', '갑작스러운 문제가 생기면 이 사람은?', '해결책부터 찾는다', '사람들 기분부터 살핀다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'photo-team', 6, '함께 사진을 찍으면 나는?', '함께 사진을 찍으면 이 사람은?', '구도를 잡는 쪽이다', '표정을 만드는 쪽이다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'gift-team', 7, '선물을 같이 고르면 나는?', '선물을 같이 고르면 이 사람은?', '상대 정보를 모은다', '결정적인 한 가지를 고른다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'story-team', 8, '둘만 아는 이야기가 생기면 나는?', '둘만 아는 이야기가 생기면 이 사람은?', '자세한 장면을 기억한다', '그때의 감정을 기억한다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'support-team', 9, '친구가 지치면 나는?', '친구가 지치면 이 사람은?', '필요한 일을 같이 한다', '옆에 있어 주며 듣는다', false),
    ('7dc011c0-3c6e-46b6-a190-cf462af5a1c0'::uuid, 'best-combo', 10, '친구와 가장 잘 맞는 순간은?', '이 사람이 친구와 가장 잘 맞는 순간은?', '즉흥적으로 같이 움직일 때', '서로 다른 걸 채워 줄 때', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '7dc011c0-3c6e-46b6-a190-cf462af5a1c0'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('7dc011c0-3c6e-46b6-a190-cf462af5a1c0')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '7dc011c0-3c6e-46b6-a190-cf462af5a1c0'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '0e2ac6eb-55f4-40f2-b943-6de54125f6b3'::uuid,
    'group-chat-role',
    '단톡방의 나',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid,
    '0e2ac6eb-55f4-40f2-b943-6de54125f6b3'::uuid,
    'group-chat-role-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '0e2ac6eb-55f4-40f2-b943-6de54125f6b3'
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
select seed.*
from (
  values
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'new-message', 1, '단체 채팅방에 새 소식이 올라오면 나는?', '단체 채팅방에 새 소식이 올라오면 이 사람은?', '바로 리액션을 남긴다', '내용을 다 읽고 한마디 한다', true),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'plan-maker', 2, '모임 얘기가 나오면 나는?', '모임 얘기가 나오면 이 사람은?', '날짜 후보를 먼저 던진다', '사람들 반응을 보고 고른다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'photo-drop', 3, '사진이 한꺼번에 올라오면 나는?', '사진이 한꺼번에 올라오면 이 사람은?', '마음에 드는 한 장을 고른다', '그때 있었던 일을 다시 꺼낸다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'silence-break', 4, '채팅방이 조용해지면 나는?', '채팅방이 조용해지면 이 사람은?', '새로운 소재를 올린다', '조용한 상태도 그냥 둔다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'notification', 5, '알림이 많이 쌓이면 나는?', '알림이 많이 쌓이면 이 사람은?', '틈날 때 처음부터 읽는다', '중요한 부분부터 훑는다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'birthday', 6, '누군가 생일인 걸 알면 나는?', '누군가 생일인 걸 알면 이 사람은?', '바로 축하 메시지를 보낸다', '센스 있는 사진이나 말을 찾는다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'decision', 7, '의견이 갈리는 대화에서 나는?', '의견이 갈리는 대화에서 이 사람은?', '내 선택을 분명히 말한다', '각자 편한 쪽을 찾게 둔다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'inside-joke', 8, '우리끼리만 아는 얘기가 나오면 나는?', '우리끼리만 아는 얘기가 나오면 이 사람은?', '더 살을 붙여 웃긴다', '그때 장면을 정확히 복기한다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'exit', 9, '대화가 너무 빨라지면 나는?', '대화가 너무 빨라지면 이 사람은?', '흐름에 맞춰 짧게 낀다', '나중에 읽고 필요한 말만 한다', false),
    ('6a7ec1ef-5221-4c0e-aa22-ec954a53015c'::uuid, 'meeting-day', 10, '모임 당일 나는?', '모임 당일 이 사람은?', '일찍부터 분위기를 띄운다', '도착해서 자연스럽게 합류한다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '6a7ec1ef-5221-4c0e-aa22-ec954a53015c'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('6a7ec1ef-5221-4c0e-aa22-ec954a53015c')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '6a7ec1ef-5221-4c0e-aa22-ec954a53015c'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '14141414-1414-4414-8414-141414141414'::uuid,
    'honest-self',
    '말 안 해도 알까?',
    'close_relationship',
    'medium',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '18181818-1818-4818-8818-181818181818'::uuid,
    '14141414-1414-4414-8414-141414141414'::uuid,
    'honest-self-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '14141414-1414-4414-8414-141414141414'
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
select seed.*
from (
  values
    ('18181818-1818-4818-8818-181818181818'::uuid, 'busy-mind', 1, '마음이 복잡한 날 나는?', '마음이 복잡한 날 이 사람은?', '누군가에게 말하며 정리한다', '혼자 시간을 보내며 정리한다', true),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'compliment', 2, '칭찬을 들으면 나는?', '칭찬을 들으면 이 사람은?', '기분 좋은 티가 바로 난다', '쑥스러워도 조용히 받아들인다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'big-choice', 3, '중요한 선택 앞에서 나는?', '중요한 선택 앞에서 이 사람은?', '주변 의견을 들어 본다', '내 기준부터 정리한다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'letdown', 4, '기대했던 일이 어긋난 직후 나는?', '기대했던 일이 어긋난 직후 이 사람은?', '아쉬움을 말로 표현한다', '다음 방법부터 찾는다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'misunderstood', 5, '오해받았다고 느끼면 나는?', '오해받았다고 느끼면 이 사람은?', '그 자리에서 바로 풀려고 한다', '감정이 가라앉은 뒤 이야기한다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'free-day', 6, '아무 약속 없는 하루가 생기면 나는?', '아무 약속 없는 하루가 생기면 이 사람은?', '하고 싶던 일을 찾아 움직인다', '쉬면서 그날 기분을 따른다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'need-help', 7, '도움이 필요할 때 나는?', '도움이 필요할 때 이 사람은?', '구체적으로 부탁한다', '혼자 해본 뒤 부탁한다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'new-start', 8, '새로운 일을 시작할 때 나는?', '새로운 일을 시작할 때 이 사람은?', '일단 해보며 감을 잡는다', '충분히 알아본 뒤 시작한다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'attention', 9, '사람들이 나를 주목하면 나는?', '사람들이 이 사람을 주목하면?', '그 분위기를 즐기는 편이다', '조금 뒤로 물러나는 편이다', false),
    ('18181818-1818-4818-8818-181818181818'::uuid, 'affection', 10, '좋아하는 사람에게 마음을 표현할 때 나는 주로?', '좋아하는 사람에게 이 사람은 마음을 주로 어떻게 표현할까?', '말로 직접 전한다', '행동으로 자연스럽게 보여 준다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '18181818-1818-4818-8818-181818181818'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('18181818-1818-4818-8818-181818181818')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '18181818-1818-4818-8818-181818181818'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    'f3505753-0118-4778-86fe-19e45d6ec73d'::uuid,
    'laugh-track',
    '웃음 버튼의 위치',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid,
    'f3505753-0118-4778-86fe-19e45d6ec73d'::uuid,
    'laugh-track-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = 'f3505753-0118-4778-86fe-19e45d6ec73d'
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
select seed.*
from (
  values
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'first-laugh', 1, '웃긴 일이 생기면 나는?', '웃긴 일이 생기면 이 사람은?', '바로 크게 반응한다', '한 번 곱씹고 터진다', true),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'storytelling', 2, '재밌는 이야기를 할 때 나는?', '재밌는 이야기를 할 때 이 사람은?', '상황을 자세히 살린다', '핵심만 빠르게 던진다', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'pun', 3, '말장난이 떠오르면 나는?', '말장난이 떠오르면 이 사람은?', '참지 못하고 바로 말한다', '타이밍이 맞을 때 꺼낸다', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'friend-joke', 4, '친구가 웃긴 말을 하면 나는?', '친구가 웃긴 말을 하면 이 사람은?', '더 크게 받아친다', '한참 웃고 다시 꺼낸다', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'unexpected', 5, '예상 못 한 상황에서 나는?', '예상 못 한 상황에서 이 사람은?', '당황한 게 더 웃기다', '상황을 정리한 뒤 웃는다', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'reference', 6, '예전 웃긴 일을 나는?', '예전 웃긴 일을 이 사람은?', '새 맥락에서도 자주 꺼낸다', '딱 맞는 순간에만 꺼낸다', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'quiet-laugh', 7, '진짜 웃길 때 나는?', '진짜 웃길 때 이 사람은?', '소리부터 크게 난다', '말없이 표정부터 바뀐다', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'humor-style', 8, '더 끌리는 유머는?', '이 사람이 더 끌리는 유머는?', '관찰하다가 툭 나오는 말', '상상력이 터지는 말', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'share-laugh', 9, '혼자 웃긴 걸 보면 나는?', '혼자 웃긴 걸 보면 이 사람은?', '누군가에게 보여 주고 싶다', '혼자 웃은 걸로도 충분하다', false),
    ('0fbb3eba-ee22-44ed-8a14-fff43f76ad81'::uuid, 'recover', 10, '너무 웃어서 힘들면 나는?', '너무 웃어서 힘들면 이 사람은?', '또 생각나서 다시 웃는다', '물 한 잔 마시고 진정한다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '0fbb3eba-ee22-44ed-8a14-fff43f76ad81'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('0fbb3eba-ee22-44ed-8a14-fff43f76ad81')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '0fbb3eba-ee22-44ed-8a14-fff43f76ad81'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
values (
  '11111111-1111-4111-8111-111111111111',
  'old-friend',
  '우리는 아직도 통하는 편',
  'old_friend',
  'low',
  true
)
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
values (
  '15151515-1515-4515-8515-151515151515',
  '11111111-1111-4111-8111-111111111111',
  'old-friend-v1'
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
select seed.*
from (
  values
    ('15151515-1515-4515-8515-151515151515'::uuid, 'conflict', 1, '서운한 일이 생기면 나는?', '서운한 일이 생기면 이 사람은?', '바로 이야기한다', '생각을 정리한 뒤 말한다', true),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'reunion', 2, '오랜만에 친구를 만나면 나는?', '오랜만에 친구를 만나면 이 사람은?', '어제 본 듯 바로 편해진다', '근황부터 천천히 맞춰 간다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'plans', 3, '약속을 잡을 때 나는?', '약속을 잡을 때 이 사람은?', '미리 날짜를 정한다', '그때그때 편한 날을 본다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'comfort', 4, '친구가 고민을 털어놓으면 나는?', '친구가 고민을 털어놓으면 이 사람은?', '먼저 끝까지 들어준다', '해결 방법부터 같이 찾는다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'gathering', 5, '여러 친구가 모인 자리에서 나는?', '여러 친구가 모인 자리에서 이 사람은?', '먼저 분위기를 띄운다', '익숙한 사람 곁에서 시작한다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'reconnect', 6, '연락이 뜸해졌을 때 나는?', '연락이 뜸해졌을 때 이 사람은?', '짧게 안부부터 보낸다', '만날 약속부터 잡는다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'memory', 7, '옛날 이야기가 나오면 나는?', '옛날 이야기가 나오면 이 사람은?', '구체적인 장면부터 떠올린다', '그때 느낀 감정부터 떠올린다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'travel', 8, '친구와 여행 일정을 정할 때 나는?', '친구와 여행 일정을 정할 때 이 사람은?', '미리 계획을 세운다', '현장에서 그때그때 정한다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'celebration', 9, '친구의 좋은 소식을 들은 직후 나는?', '친구의 좋은 소식을 들은 직후 이 사람은?', '바로 연락해 축하한다', '다음에 만날 때 직접 축하한다', false),
    ('15151515-1515-4515-8515-151515151515'::uuid, 'hard-day', 10, '힘든 날에 나는?', '힘든 날에 이 사람은?', '먼저 연락해 털어놓는다', '혼자 정리한 뒤 연락한다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '15151515-1515-4515-8515-151515151515'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('15151515-1515-4515-8515-151515151515')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '15151515-1515-4515-8515-151515151515'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '0fbddb18-d125-429e-ad8f-d6581a3af762'::uuid,
    'reply-temperature',
    '읽고도 생각 중',
    'new_connection',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid,
    '0fbddb18-d125-429e-ad8f-d6581a3af762'::uuid,
    'reply-temperature-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '0fbddb18-d125-429e-ad8f-d6581a3af762'
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
select seed.*
from (
  values
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'reply-gap', 1, '메시지를 보낸 뒤 답이 늦으면 나는?', '메시지를 보낸 뒤 답이 늦으면 이 사람은?', '다른 일을 하며 기다린다', '무슨 일 있나 한 번 확인한다', true),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'first-text', 2, '먼저 연락하고 싶을 때 나는?', '먼저 연락하고 싶을 때 이 사람은?', '짧은 안부부터 보낸다', '보낼 이유가 생길 때까지 기다린다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'emoji-reply', 3, '할 말은 많은데 바쁠 때 나는?', '할 말은 많은데 바쁠 때 이 사람은?', '이모지로 먼저 신호를 남긴다', '여유 생긴 뒤 제대로 답한다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'long-message', 4, '긴 메시지를 받으면 나는?', '긴 메시지를 받으면 이 사람은?', '읽으며 바로바로 답한다', '한 번 다 읽고 정리해 답한다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'typo', 5, '오타를 발견하면 나는?', '오타를 발견하면 이 사람은?', '바로 수정해서 다시 보낸다', '뜻이 통하면 그냥 둔다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'late-night', 6, '늦은 밤 연락이 오면 나는?', '늦은 밤 연락이 오면 이 사람은?', '지금 할 수 있는 만큼 답한다', '다음 날 정신 있을 때 답한다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'reaction', 7, '재밌는 걸 발견하면 나는?', '재밌는 걸 발견하면 이 사람은?', '바로 공유한다', '나중에 모아서 보낸다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'voice-note', 8, '텍스트로 설명이 길어질 것 같으면 나는?', '텍스트로 설명이 길어질 것 같으면 이 사람은?', '음성이나 통화로 바꾼다', '글로 차근차근 적는다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'read-receipt', 9, '읽음 표시를 신경 쓸 때 나는?', '읽음 표시를 신경 쓸 때 이 사람은?', '상대 상황을 먼저 생각한다', '내가 느낀 걸 솔직히 말한다', false),
    ('9f56e941-b8a9-4d57-86a5-0991c7fc62f9'::uuid, 'goodbye', 10, '대화를 마칠 때 나는?', '대화를 마칠 때 이 사람은?', '다음 이야기를 남겨 둔다', '깔끔하게 인사하고 끝낸다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '9f56e941-b8a9-4d57-86a5-0991c7fc62f9'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('9f56e941-b8a9-4d57-86a5-0991c7fc62f9')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '9f56e941-b8a9-4d57-86a5-0991c7fc62f9'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    'a714df85-063e-44f5-a3e5-cc4d6af032bc'::uuid,
    'room-temperature',
    '방 온도와 내 기분',
    'close_relationship',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '5d802085-2001-4430-a765-7f8e9ce7900f'::uuid,
    'a714df85-063e-44f5-a3e5-cc4d6af032bc'::uuid,
    'room-temperature-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = 'a714df85-063e-44f5-a3e5-cc4d6af032bc'
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
select seed.*
from (
  values
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'reset-space', 1, '집에 돌아와 가장 먼저 하는 건?', '이 사람이 집에 돌아와 가장 먼저 하는 건?', '공간을 편하게 바꾼다', '내 몸부터 쉬게 한다', true),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'lighting', 2, '밤에 더 편한 빛은?', '이 사람이 밤에 더 편해하는 빛은?', '환하고 또렷한 빛', '은은하고 따뜻한 빛', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'sound', 3, '집에서 나는?', '집에서 이 사람은?', '무언가 틀어 두는 편이다', '조용한 편이 좋다', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'tidy', 4, '정리가 필요해 보이면 나는?', '정리가 필요해 보이면 이 사람은?', '바로 눈에 보이는 곳부터 한다', '각 잡고 한 번에 한다', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'blanket', 5, '집에서 쉬는 자세는?', '이 사람이 집에서 쉬는 자세는?', '편한 옷으로 완전히 갈아입는다', '지금 차림 그대로 편하게 앉는다', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'window', 6, '바깥 날씨가 좋으면 나는?', '바깥 날씨가 좋으면 이 사람은?', '창문을 열고 공기를 바꾼다', '밖에 나갈 계획을 세운다', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'plant', 7, '방에 하나를 더 들인다면 나는?', '이 사람이 방에 하나를 더 들인다면?', '보기 좋은 장식', '매일 쓰는 편한 물건', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'desk', 8, '책상 위가 복잡해지면 나는?', '책상 위가 복잡해지면 이 사람은?', '정리해야 집중된다', '익숙한 어수선함도 괜찮다', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'scent', 9, '공간 분위기를 바꾸고 싶을 때 나는?', '공간 분위기를 바꾸고 싶을 때 이 사람은?', '향이나 음악을 바꾼다', '가구나 배치를 바꾼다', false),
    ('5d802085-2001-4430-a765-7f8e9ce7900f'::uuid, 'guest', 10, '집에 손님이 온다면 나는?', '집에 손님이 온다면 이 사람은?', '먹을 것부터 챙긴다', '편히 있을 자리를 만든다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '5d802085-2001-4430-a765-7f8e9ce7900f'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('5d802085-2001-4430-a765-7f8e9ce7900f')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '5d802085-2001-4430-a765-7f8e9ce7900f'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '547524ff-9929-44ef-b6d0-70b152b2f1e2'::uuid,
    'small-luxury',
    '작은 사치 연구소',
    'close_relationship',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid,
    '547524ff-9929-44ef-b6d0-70b152b2f1e2'::uuid,
    'small-luxury-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '547524ff-9929-44ef-b6d0-70b152b2f1e2'
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
select seed.*
from (
  values
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'treat', 1, '나를 기분 좋게 하는 작은 소비는?', '이 사람을 기분 좋게 하는 작은 소비는?', '평소보다 좋은 한 가지를 고른다', '여러 개의 작은 즐거움을 고른다', true),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'coffee', 2, '카페에서 나는?', '카페에서 이 사람은?', '늘 좋아하는 메뉴를 고른다', '계절 메뉴를 한 번 시도한다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'gift', 3, '나에게 선물한다면 나는?', '이 사람에게 선물한다면 이 사람은?', '오래 쓸 물건을 고른다', '그날 바로 즐길 것을 고른다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'upgrade', 4, '더 좋은 선택지가 보이면 나는?', '더 좋은 선택지가 보이면 이 사람은?', '값어치를 따져 업그레이드한다', '기본으로도 충분한지 본다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'comfort', 5, '집에서 편해지려면 나는?', '집에서 편해지려면 이 사람은?', '촉감 좋은 것을 바꾼다', '공간 분위기를 바꾼다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'meal', 6, '혼자 맛있는 걸 먹을 때 나는?', '혼자 맛있는 걸 먹을 때 이 사람은?', '제대로 차려서 먹는다', '편한 방식으로 즐긴다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'collect', 7, '마음에 드는 물건을 발견하면 나는?', '마음에 드는 물건을 발견하면 이 사람은?', '비슷한 걸 모으고 싶어진다', '하나만 골라 오래 쓴다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'occasion', 8, '특별한 날이 아니어도 나는?', '특별한 날이 아니어도 이 사람은?', '작은 이유를 만들어 챙긴다', '정말 필요할 때 아껴 둔다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'recommend', 9, '좋은 걸 발견하면 나는?', '좋은 걸 발견하면 이 사람은?', '누구에게든 추천하고 싶다', '나만의 목록에 넣어 둔다', false),
    ('3ba505a6-7ebc-47af-aa38-c387abfb40ac'::uuid, 'memory', 10, '돈을 쓸 때 더 오래 남는 건?', '이 사람에게 더 오래 남는 건?', '물건을 쓰는 시간', '그때 만든 경험', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '3ba505a6-7ebc-47af-aa38-c387abfb40ac'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('3ba505a6-7ebc-47af-aa38-c387abfb40ac')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '3ba505a6-7ebc-47af-aa38-c387abfb40ac'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '79c2f482-e254-41a5-9e27-296bf416a5d7'::uuid,
    'snack-personality',
    '간식 취향 보고서',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    'c2446626-5656-4515-8bd8-22315c5697bf'::uuid,
    '79c2f482-e254-41a5-9e27-296bf416a5d7'::uuid,
    'snack-personality-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '79c2f482-e254-41a5-9e27-296bf416a5d7'
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
select seed.*
from (
  values
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'snack-moment', 1, '간식이 당길 때 나는?', '간식이 당길 때 이 사람은?', '정해 둔 최애를 찾는다', '그날 당기는 맛을 고른다', true),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'sweet-salty', 2, '더 먼저 손이 가는 쪽은?', '이 사람에게 더 먼저 손이 가는 쪽은?', '달콤한 한 입', '짭짤한 한 입', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'share', 3, '간식을 나눌 때 나는?', '간식을 나눌 때 이 사람은?', '내가 좋아하는 걸 권한다', '상대 취향을 먼저 묻는다', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'movie-snack', 4, '뭘 보며 먹을 때 나는?', '뭘 보며 먹을 때 이 사람은?', '손이 바쁘지 않은 걸 고른다', '먹는 재미가 있는 걸 고른다', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'new-flavor', 5, '처음 보는 맛을 만나면 나는?', '처음 보는 맛을 만나면 이 사람은?', '궁금해서 시도한다', '후기를 보고 결정한다', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'last-bite', 6, '마지막 한 입이 남으면 나는?', '마지막 한 입이 남으면 이 사람은?', '마지막까지 내가 먹는다', '주변에 한 번 권한다', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'stock', 7, '집에 간식을 둘 때 나는?', '집에 간식을 둘 때 이 사람은?', '없으면 불안한 걸 쟁인다', '그때그때 필요한 만큼 산다', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'pairing', 8, '음료와 간식을 고를 때 나는?', '음료와 간식을 고를 때 이 사람은?', '잘 어울리는 조합을 맞춘다', '각자 먹고 싶은 걸 고른다', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'craving', 9, '먹고 싶은 게 있는데 없으면 나는?', '먹고 싶은 게 있는데 없으면 이 사람은?', '비슷한 걸 찾아 해결한다', '다음 기회까지 기다린다', false),
    ('c2446626-5656-4515-8bd8-22315c5697bf'::uuid, 'gift-snack', 10, '누군가에게 간식을 고른다면 나는?', '누군가에게 간식을 고른다면 이 사람은?', '안전하게 좋아할 만한 걸 고른다', '새롭게 좋아할 걸 골라 본다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'c2446626-5656-4515-8bd8-22315c5697bf'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('c2446626-5656-4515-8bd8-22315c5697bf')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'c2446626-5656-4515-8bd8-22315c5697bf'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    'b5a4e134-2704-40b6-8fa3-7ad47c13e833'::uuid,
    'social-battery',
    '사람들 사이 배터리',
    'close_relationship',
    'medium',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '71766d28-450c-48ec-b083-0d8270c9317a'::uuid,
    'b5a4e134-2704-40b6-8fa3-7ad47c13e833'::uuid,
    'social-battery-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = 'b5a4e134-2704-40b6-8fa3-7ad47c13e833'
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
select seed.*
from (
  values
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'recharge', 1, '사람들과 오래 보낸 뒤 나는?', '사람들과 오래 보낸 뒤 이 사람은?', '누군가와 더 이야기하며 마무리한다', '혼자 조용히 있어야 회복된다', true),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'party-entry', 2, '모임에 도착하면 나는?', '모임에 도착하면 이 사람은?', '여러 사람에게 먼저 인사한다', '익숙한 사람부터 찾는다', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'new-person', 3, '처음 보는 사람이 있으면 나는?', '처음 보는 사람이 있으면 이 사람은?', '궁금한 걸 먼저 묻는다', '대화 흐름을 보며 합류한다', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'small-talk', 4, '가벼운 대화가 길어지면 나는?', '가벼운 대화가 길어지면 이 사람은?', '다른 화제를 더 꺼낸다', '잠깐 쉬는 시간을 찾는다', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'week-plan', 5, '약속이 연달아 잡히면 나는?', '약속이 연달아 잡히면 이 사람은?', '재밌을 것 같아 기대한다', '중간에 비는 시간을 만든다', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'one-on-one', 6, '더 편한 대화는?', '이 사람이 더 편해하는 대화는?', '여러 사람과 빠르게 오가는 대화', '한 사람과 깊게 이어지는 대화', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'after-cancel', 7, '약속이 취소되면 나는?', '약속이 취소되면 이 사람은?', '다른 계획을 바로 찾는다', '뜻밖의 휴식을 반긴다', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'hosting', 8, '사람들을 초대하는 날 나는?', '사람들을 초대하는 날 이 사람은?', '각자 편하게 놀게 만든다', '함께할 흐름을 준비한다', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'leave-time', 9, '모임을 마칠 때 나는?', '모임을 마칠 때 이 사람은?', '마지막까지 남아 이야기한다', '좋았을 때 먼저 인사한다', false),
    ('71766d28-450c-48ec-b083-0d8270c9317a'::uuid, 'reset', 10, '내 컨디션을 되찾는 가장 빠른 방법은?', '이 사람이 컨디션을 되찾는 가장 빠른 방법은?', '좋아하는 사람과 시간을 보내기', '나만의 시간 확보하기', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '71766d28-450c-48ec-b083-0d8270c9317a'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('71766d28-450c-48ec-b083-0d8270c9317a')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '71766d28-450c-48ec-b083-0d8270c9317a'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '78b2ca60-1f42-4114-a6e0-22155c2d701c'::uuid,
    'spontaneous-plan',
    '갑자기, 지금, 같이?',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    'd4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid,
    '78b2ca60-1f42-4114-a6e0-22155c2d701c'::uuid,
    'spontaneous-plan-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '78b2ca60-1f42-4114-a6e0-22155c2d701c'
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
select seed.*
from (
  values
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'sudden-invite', 1, '지금 보자는 연락이 오면 나는?', '지금 보자는 연락이 오면 이 사람은?', '가능하면 바로 움직인다', '준비할 시간을 먼저 본다', true),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'meeting-place', 2, '약속 장소를 정할 때 나는?', '약속 장소를 정할 때 이 사람은?', '딱 떠오르는 곳을 말한다', '서로 편한 중간을 찾는다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'one-more', 3, '재밌는 시간이 끝날 무렵 나는?', '재밌는 시간이 끝날 무렵 이 사람은?', '한 곳 더 가자고 한다', '좋을 때 다음을 기약한다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'weather-change', 4, '날씨 때문에 계획이 바뀌면 나는?', '날씨 때문에 계획이 바뀌면 이 사람은?', '다른 할 일을 바로 고른다', '그 상황에 맞춰 천천히 바꾼다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'unexpected-guest', 5, '예상 못 한 합류자가 생기면 나는?', '예상 못 한 합류자가 생기면 이 사람은?', '더 재밌어질 것 같아 반긴다', '원래 약속의 결을 먼저 본다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'late-start', 6, '약속 시간에 늦을 것 같으면 나는?', '약속 시간에 늦을 것 같으면 이 사람은?', '바로 알리고 대안을 말한다', '얼마나 늦을지 확인하고 알린다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'new-place', 7, '처음 보는 장소를 고를 때 나는?', '처음 보는 장소를 고를 때 이 사람은?', '호기심으로 일단 가 본다', '후기와 정보를 먼저 본다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'budget', 8, '즉흥 약속의 비용은 나는?', '즉흥 약속의 비용은 이 사람은?', '재밌으면 조금 더 쓸 수 있다', '편한 범위를 먼저 정한다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'surprise', 9, '작은 깜짝 계획을 세울 때 나는?', '작은 깜짝 계획을 세울 때 이 사람은?', '완전히 비밀로 준비한다', '힌트를 조금씩 준다', false),
    ('d4d7ede6-9938-4e5b-a79d-bc858264c7cc'::uuid, 'memory-plan', 10, '좋은 즉흥 약속은 내게?', '이 사람에게 좋은 즉흥 약속은?', '예상 못 한 장면이 생긴 날', '서로 편하게 웃은 날', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'd4d7ede6-9938-4e5b-a79d-bc858264c7cc'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('d4d7ede6-9938-4e5b-a79d-bc858264c7cc')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'd4d7ede6-9938-4e5b-a79d-bc858264c7cc'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '9e0d1399-0314-497d-99aa-79926e226726'::uuid,
    'tiny-routine',
    '혼자만의 루틴',
    'close_relationship',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '4b96ecee-1893-4515-929c-bd792867f92e'::uuid,
    '9e0d1399-0314-497d-99aa-79926e226726'::uuid,
    'tiny-routine-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '9e0d1399-0314-497d-99aa-79926e226726'
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
select seed.*
from (
  values
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'morning-start', 1, '하루를 시작할 때 나는?', '하루를 시작할 때 이 사람은?', '정해 둔 순서가 있어야 편하다', '그날 기분에 따라 시작한다', true),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'first-sound', 2, '아침에 가장 먼저 찾는 건?', '이 사람이 아침에 가장 먼저 찾는 건?', '조용한 시간', '음악이나 소리', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'to-do', 3, '할 일을 기억하는 방식은?', '이 사람이 할 일을 기억하는 방식은?', '적어 두고 지운다', '머릿속 우선순위를 따른다', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'reset', 4, '흐트러진 하루를 되돌릴 때 나는?', '흐트러진 하루를 되돌릴 때 이 사람은?', '작은 것부터 하나 끝낸다', '잠깐 멈추고 다시 계획한다', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'walk', 5, '잠깐 바람 쐴 때 나는?', '잠깐 바람 쐴 때 이 사람은?', '목적지를 정하고 걷는다', '발길 가는 대로 걷는다', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'music', 6, '집중할 때 나는?', '집중할 때 이 사람은?', '늘 듣는 걸 반복한다', '새로운 걸 틀어 분위기를 바꾼다', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'little-reward', 7, '해야 할 일을 끝내면 나는?', '해야 할 일을 끝내면 이 사람은?', '작은 보상을 챙긴다', '바로 다음 일로 넘어간다', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'night-close', 8, '잠들기 전 나는?', '잠들기 전 이 사람은?', '내일을 한 번 점검한다', '오늘 생각을 비워 낸다', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'week-reset', 9, '새 주가 시작되기 전 나는?', '새 주가 시작되기 전 이 사람은?', '미리 챙길 걸 정리한다', '시작되면 맞춰 간다', false),
    ('4b96ecee-1893-4515-929c-bd792867f92e'::uuid, 'broken-routine', 10, '루틴이 깨졌을 때 나는?', '루틴이 깨졌을 때 이 사람은?', '빠르게 원래대로 돌아간다', '새로운 리듬으로 받아들인다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '4b96ecee-1893-4515-929c-bd792867f92e'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('4b96ecee-1893-4515-929c-bd792867f92e')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '4b96ecee-1893-4515-929c-bd792867f92e'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '4502a4a8-7ba4-4d3d-9aae-6ca220c57658'::uuid,
    'trip-chemistry',
    '여행 가방의 철학',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    'c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid,
    '4502a4a8-7ba4-4d3d-9aae-6ca220c57658'::uuid,
    'trip-chemistry-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '4502a4a8-7ba4-4d3d-9aae-6ca220c57658'
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
select seed.*
from (
  values
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'packing', 1, '여행 짐을 쌀 때 나는?', '여행 짐을 쌀 때 이 사람은?', '필요한 걸 목록으로 챙긴다', '가방 공간을 보며 감으로 챙긴다', true),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'arrival', 2, '도착하자마자 나는?', '도착하자마자 이 사람은?', '짐부터 풀고 동선을 본다', '일단 주변부터 구경한다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'map', 3, '길을 찾을 때 나는?', '길을 찾을 때 이 사람은?', '지도와 후기를 미리 본다', '발길 가는 쪽을 따라간다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'food', 4, '여행지 식당을 고를 때 나는?', '여행지 식당을 고를 때 이 사람은?', '대표 메뉴부터 먹어 본다', '현지에서 눈에 띈 곳에 들어간다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'photo', 5, '예쁜 풍경을 보면 나는?', '예쁜 풍경을 보면 이 사람은?', '사진을 남기고 오래 본다', '사진보다 먼저 눈에 담는다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'change', 6, '일정이 어그러지면 나는?', '일정이 어그러지면 이 사람은?', '대안을 빠르게 찾는다', '뜻밖의 시간으로 받아들인다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'souvenir', 7, '기념품을 고를 때 나는?', '기념품을 고를 때 이 사람은?', '쓸 수 있는 걸 고른다', '그 장소다운 걸 고른다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'morning', 8, '여행 중 아침 나는?', '여행 중 아침 이 사람은?', '일찍 시작해 하루를 길게 쓴다', '천천히 일어나 여유를 챙긴다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'detour', 9, '가고 싶던 곳이 멀어 보이면 나는?', '가고 싶던 곳이 멀어 보이면 이 사람은?', '그래도 루트를 맞춰 간다', '가까운 즐길 거리를 찾는다', false),
    ('c4d9b4e9-7318-40b3-ad1a-baa4036697f2'::uuid, 'last-night', 10, '여행 마지막 밤 나는?', '여행 마지막 밤 이 사람은?', '다음 날을 위해 정리한다', '마지막까지 밖에서 논다', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'c4d9b4e9-7318-40b3-ad1a-baa4036697f2'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('c4d9b4e9-7318-40b3-ad1a-baa4036697f2')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = 'c4d9b4e9-7318-40b3-ad1a-baa4036697f2'
    and version.published_at is null
);

insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
select seed.*
from (
  values (
    '2166c7e7-0d4c-411b-bed2-fe3337a2d24c'::uuid,
    'weekend-escape',
    '주말 사용 설명서',
    'old_friend',
    'low',
    true
  )
) as seed (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
where to_regprocedure(
  'public.get_visitor_response_pack_metadata(uuid,bytea)'
) is not null
on conflict (id) do nothing;

insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    '27934ccc-3369-4500-967d-565a5e0643db'::uuid,
    '2166c7e7-0d4c-411b-bed2-fe3337a2d24c'::uuid,
    'weekend-escape-v1'
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = '2166c7e7-0d4c-411b-bed2-fe3337a2d24c'
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
select seed.*
from (
  values
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'free-morning', 1, '아무 일정 없는 토요일 아침 나는?', '아무 일정 없는 토요일 아침 이 사람은?', '일단 밖으로 나갈 이유를 찾는다', '침대에서 천천히 하루를 연다', true),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'last-minute', 2, '갑자기 놀자는 연락이 오면 나는?', '갑자기 놀자는 연락이 오면 이 사람은?', '가능하면 바로 합류한다', '내 컨디션과 계획을 먼저 본다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'rest-plan', 3, '쉬는 날을 앞두고 나는?', '쉬는 날을 앞두고 이 사람은?', '하고 싶은 걸 미리 적어 둔다', '그날 기분에 맡긴다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'home-or-out', 4, '주말 오후에 나는 더 자주?', '주말 오후에 이 사람은 더 자주?', '새로운 동네를 돌아다닌다', '익숙한 곳에서 시간을 보낸다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'weather', 5, '날씨가 좋다는 말을 들으면 나는?', '날씨가 좋다는 말을 들으면 이 사람은?', '밖에 나갈 약속을 만든다', '창문 열고 집에서도 즐긴다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'late-lunch', 6, '늦은 점심을 고를 때 나는?', '늦은 점심을 고를 때 이 사람은?', '처음 보는 메뉴를 시도한다', '확실히 좋아하는 메뉴를 고른다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'one-more-episode', 7, '재밌는 걸 보기 시작하면 나는?', '재밌는 걸 보기 시작하면 이 사람은?', '정한 만큼만 보고 멈춘다', '한 번만 더를 여러 번 한다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'sunday-night', 8, '일요일 저녁이 되면 나는?', '일요일 저녁이 되면 이 사람은?', '다음 주 준비를 조금 한다', '마지막까지 주말에 집중한다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'mini-adventure', 9, '멀리 못 가는 날 나는?', '멀리 못 가는 날 이 사람은?', '가까운 곳에서 새 코스를 만든다', '집에서 좋아하는 걸 꺼낸다', false),
    ('27934ccc-3369-4500-967d-565a5e0643db'::uuid, 'weekend-proof', 10, '주말이 잘 보냈다고 느끼는 순간은?', '이 사람이 주말을 잘 보냈다고 느끼는 순간은?', '새로운 장면이 생겼을 때', '제대로 쉬었다고 느낄 때', false)
) as seed (
  pack_version_id,
  id,
  position,
  owner_prompt,
  visitor_prompt,
  option_a,
  option_b,
  is_signature
)
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '27934ccc-3369-4500-967d-565a5e0643db'
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version('27934ccc-3369-4500-967d-565a5e0643db')
where exists (
  select 1
  from public.pack_versions as version
  where version.id = '27934ccc-3369-4500-967d-565a5e0643db'
    and version.published_at is null
);


update public.pack_templates
set title = case slug
  when 'old-friend' then '우리는 아직도 통하는 편'
  when 'first-impression' then '첫 장면, 네 버전'
  when 'coworker' then '퇴근 전의 우리'
  when 'honest-self' then '말 안 해도 알까?'
  else title
end
where slug in ('old-friend', 'first-impression', 'coworker', 'honest-self');

commit;
