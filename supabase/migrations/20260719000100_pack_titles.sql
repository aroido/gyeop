begin;

do $function$
declare
  v_updated integer;
begin
  if exists (
    select 1
    from (
      values
        ('11111111-1111-4111-8111-111111111111'::uuid, 'old-friend'),
        ('12121212-1212-4212-8212-121212121212'::uuid, 'first-impression'),
        ('13131313-1313-4313-8313-131313131313'::uuid, 'coworker'),
        ('14141414-1414-4414-8414-141414141414'::uuid, 'honest-self')
    ) as expected(id, slug)
    join public.pack_templates as template
      on template.id = expected.id
      or template.slug = expected.slug
    where template.id <> expected.id
      or template.slug <> expected.slug
  ) then
    raise exception using
      errcode = '23514',
      message = 'pack title migration found a template identity mismatch';
  end if;

  if (
    select count(*)
    from (
      values
        ('12121212-1212-4212-8212-121212121212'::uuid, 'first-impression'),
        ('13131313-1313-4313-8313-131313131313'::uuid, 'coworker'),
        ('14141414-1414-4414-8414-141414141414'::uuid, 'honest-self')
    ) as expected(id, slug)
    join public.pack_templates as template
      on template.id = expected.id
     and template.slug = expected.slug
  ) <> 3 then
    raise exception using
      errcode = '23514',
      message = 'pack title migration is missing a required multi-pack template';
  end if;

  update public.pack_templates as template
  set title = expected.title,
      updated_at = clock_timestamp()
  from (
    values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'old-friend', '오래 본 너의 시선'),
      ('12121212-1212-4212-8212-121212121212'::uuid, 'first-impression', '처음 만난 너의 시선'),
      ('13131313-1313-4313-8313-131313131313'::uuid, 'coworker', '같이 일한 너의 시선'),
      ('14141414-1414-4414-8414-141414141414'::uuid, 'honest-self', '가까운 너의 시선')
  ) as expected(id, slug, title)
  where template.id = expected.id
    and template.slug = expected.slug;

  get diagnostics v_updated = row_count;

  if v_updated not in (3, 4) then
    raise exception using
      errcode = '23514',
      message = 'pack title migration updated an unexpected template count';
  end if;

  if (
    select count(*)
    from (
      values
        ('11111111-1111-4111-8111-111111111111'::uuid, 'old-friend', '오래 본 너의 시선'),
        ('12121212-1212-4212-8212-121212121212'::uuid, 'first-impression', '처음 만난 너의 시선'),
        ('13131313-1313-4313-8313-131313131313'::uuid, 'coworker', '같이 일한 너의 시선'),
        ('14141414-1414-4414-8414-141414141414'::uuid, 'honest-self', '가까운 너의 시선')
    ) as expected(id, slug, title)
    join public.pack_templates as template
      on template.id = expected.id
     and template.slug = expected.slug
     and template.title = expected.title
  ) <> v_updated then
    raise exception using
      errcode = '23514',
      message = 'pack title migration did not materialize the expected titles';
  end if;
end
$function$;

commit;
