# 핵심 퍼널 event 운영 계약

## 목적

MVP의 세 가지 가설을 event row 수가 아니라 서로 연결된 subject의 순서 있는 전환으로 확인한다.

1. 주인이 10장을 완료하고 공개 링크를 실제 공유한다.
2. 제출 방문자가 비교를 보고 같은 팩의 새 주인이 된다.
3. 주인이 프로필을 보고 다시 공유해 새 제출 응답을 만든다.

운영 집계는 `private.core_funnel_stage_counts`만 사용한다. 이 view와 원본 `analytics_events`는 `anon`, `authenticated`, `service_role`에 공개하지 않는다.

## subject와 properties 계약

| event | `owner_play_id` | `share_link_id` | `visitor_response_id` | 허용 properties |
|---|---:|---:|---:|---|
| `pack_opened` home | 필수 | 없음 | 없음 | `packVersion`, `entrySource=home` |
| `pack_opened` same-pack | 필수 | 없음 | 필수 | `packVersion`, `entrySource=same_pack_cta` |
| `self_pack_completed` | 필수 | 없음 | 없음 | `packVersion` |
| `share_link_created` | 필수 | 필수 | 없음 | `packVersion`, `linkKind` |
| `share_handoff_succeeded`, `share_link_copied` | 필수 | 필수 | 없음 | `packVersion`, `linkKind`, 선택적 `entrySource=profile_reshare` |
| `profile_viewed` | 필수 | 없음 | 없음 | `packVersion` |
| `profile_reshare_clicked` | 필수 | 없음 | 없음 | `packVersion`, `entrySource=profile_reshare` |
| `invite_opened` | 없음 | 없음 | 없음 | `packVersion`, `linkKind` |
| 방문자 응답 event | 없음 | 없음 | 필수 | `packVersion`, `linkKind` |

방문자 응답 event는 `relationship_selected`, `visitor_response_started`, `visitor_required_answer_saved`, `visitor_required_submitted`, `comparison_viewed`, `same_pack_start_clicked`다. 관계·알게 된 시점·A/B 선택은 analytics properties에 저장하지 않는다.

모든 event에서 이메일, IP, user agent, URL, secret/hash/token, channel/recipient, 관계·시점, A/B 선택 key를 거부한다. response가 `withdrawn`으로 바뀌거나 삭제되면 연결된 `visitor_response_id`를 제거한다. owner/link 삭제도 FK가 해당 subject를 `NULL`로 바꾸며 집계에서 제외한다.

## 집계 단계

| funnel | 순서 |
|---|---|
| `owner_share` | `self_pack_completed` → `public_link_created` → `public_share_succeeded` |
| `visitor_same_pack` | `visitor_required_submitted` → `comparison_viewed` → `same_pack_start_clicked` → `new_owner_pack_opened` |
| `profile_reshare` | `profile_viewed` → `profile_reshare_clicked` → `profile_share_succeeded` → `downstream_visitor_submitted` |

각 단계는 앞 단계와 같은 owner 또는 response subject의 교집합만 센다. same-pack click RPC는 같은 transaction에서 `comparison_viewed`를 먼저 idempotent하게 보장한다. profile reshare click RPC도 독립 render-event 요청과 경합하지 않도록 같은 transaction에서 `profile_viewed`를 먼저 기록한다. 브라우저의 click 기록과 navigation 요청은 서로 경합할 수 있으므로 `same_pack_start_clicked`와 연결된 `pack_opened`의 상호 도착 순서는 요구하지 않고 둘 다 marker 이후인지만 확인한다. `profile_reshare`의 마지막 단계는 profile-source 공유 성공 뒤 같은 공개 링크에 제출된 response가 있어야 한다. `visitor_same_pack`의 마지막 단계는 유효한 HttpOnly response capability, 제출 상태, session 만료, 같은 pack version을 DB에서 확인한 새 owner 생성만 센다.

`private.analytics_measurement_markers.core_funnel_v1` 이전 event는 제외한다. 따라서 배포 전의 subject 없는 legacy row가 새 퍼널 분모에 섞이지 않는다.

## 운영 확인

```sql
select funnel, stage, subjects
from private.core_funnel_stage_counts
order by funnel, stage;
```

배포 전 `supabase/tests/core_funnel.test.sql`과 live owner→visitor→new-owner→profile-reshare 흐름을 통과시킨다. 취소된 native share와 실패한 clipboard 시도는 성공 event를 만들지 않으므로 전환에 포함하지 않는다.
