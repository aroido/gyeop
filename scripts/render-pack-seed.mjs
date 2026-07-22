import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK_IDS = Object.freeze({
  "old-friend-v1": Object.freeze({
    template: "11111111-1111-4111-8111-111111111111",
    version: "15151515-1515-4515-8515-151515151515",
  }),
  "first-impression-v1": Object.freeze({
    template: "12121212-1212-4212-8212-121212121212",
    version: "16161616-1616-4616-8616-161616161616",
  }),
  "coworker-v1": Object.freeze({
    template: "13131313-1313-4313-8313-131313131313",
    version: "17171717-1717-4717-8717-171717171717",
  }),
  "honest-self-v1": Object.freeze({
    template: "14141414-1414-4414-8414-141414141414",
    version: "18181818-1818-4818-8818-181818181818",
  }),
});

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stableUuid(value) {
  const hash = createHash("sha256").update(value).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function packIds({ slug, version }) {
  const frozen = PACK_IDS[version];
  const original = PACK_IDS[`${slug}-v1`];
  return Object.freeze({
    template:
      original?.template ?? stableUuid(`gyeop:pack-template:${slug}-v1`),
    version: frozen?.version ?? stableUuid(`gyeop:pack-version:${version}`),
  });
}

function renderPack(pack) {
  const ids = packIds(pack);
  const isLegacyCompatiblePack = pack.slug === "old-friend";
  const rows = pack.cards.map((card) =>
    [
      ids.version,
      card.id,
      card.position,
      card.ownerPrompt,
      card.visitorPrompt,
      card.optionA,
      card.optionB,
      card.isSignature,
    ]
      .map((value, index) =>
        index === 0
          ? `${sqlString(value)}::uuid`
          : index === 2 || index === 7
            ? String(value)
            : sqlString(value),
      )
      .join(", "),
  );

  const templateInsert = isLegacyCompatiblePack
    ? `insert into public.pack_templates (
  id,
  slug,
  title,
  target_relationship,
  sensitivity,
  is_active
)
values (
  ${sqlString(ids.template)},
  ${sqlString(pack.slug)},
  ${sqlString(pack.title)},
  ${sqlString(pack.targetRelationship)},
  ${sqlString(pack.sensitivity)},
  ${pack.active}
)
on conflict (id) do nothing;`
    : `insert into public.pack_templates (
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
    ${sqlString(ids.template)}::uuid,
    ${sqlString(pack.slug)},
    ${sqlString(pack.title)},
    ${sqlString(pack.targetRelationship)},
    ${sqlString(pack.sensitivity)},
    ${pack.active}
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
on conflict (id) do nothing;`;

  const versionInsert = isLegacyCompatiblePack
    ? `insert into public.pack_versions (id, template_id, version)
values (
  ${sqlString(ids.version)},
  ${sqlString(ids.template)},
  ${sqlString(pack.version)}
)
on conflict (id) do nothing;`
    : `insert into public.pack_versions (id, template_id, version)
select seed.*
from (
  values (
    ${sqlString(ids.version)}::uuid,
    ${sqlString(ids.template)}::uuid,
    ${sqlString(pack.version)}
  )
) as seed (id, template_id, version)
where exists (
  select 1
  from public.pack_templates as template
  where template.id = ${sqlString(ids.template)}
)
on conflict (id) do nothing;`;

  return `${templateInsert}

${versionInsert}

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
${rows.map((row, index) => `    (${row})${index === rows.length - 1 ? "" : ","}`).join("\n")}
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
  where version.id = ${sqlString(ids.version)}
    and version.published_at is null
)
on conflict (pack_version_id, id) do nothing;

select public.publish_pack_version(${sqlString(ids.version)})
where exists (
  select 1
  from public.pack_versions as version
  where version.id = ${sqlString(ids.version)}
    and version.published_at is null
);`;
}

function renderCurrentPointers(packs) {
  const latestBySlug = new Map();
  for (const pack of packs) {
    const current = latestBySlug.get(pack.slug);
    const version = Number.parseInt(pack.version.match(/-v(\d+)$/)?.[1], 10);
    if (!current || version > current.version) {
      latestBySlug.set(pack.slug, { pack, version });
    }
  }
  const rows = [...latestBySlug.values()]
    .map(({ pack }) => {
      const ids = packIds(pack);
      return `    (${sqlString(ids.template)}::uuid, ${sqlString(ids.version)}::uuid)`;
    })
    .join(",\n");

  return `do $pack_current$
declare
  v_current record;
begin
  for v_current in
    select current_version.template_id, current_version.version_id
    from (
      values
${rows}
    ) as current_version (template_id, version_id)
  loop
    if exists (
      select 1
      from public.pack_versions as version
      where version.id = v_current.version_id
        and version.published_at is not null
    ) then
      perform set_config(
        'gyeop.pack_publish_version_id',
        v_current.version_id::text,
        true
      );
      update public.pack_templates as template
      set published_version_id = v_current.version_id,
          updated_at = clock_timestamp()
      where template.id = v_current.template_id
        and template.published_version_id is distinct from v_current.version_id;
    end if;
  end loop;
end
$pack_current$;`;
}

export function renderPackSeed(input) {
  const packs = (Array.isArray(input) ? input : [input]).toSorted(
    (left, right) => left.slug.localeCompare(right.slug),
  );
  return `-- Generated from active and compatibility content/packs/*-vN.json by scripts/render-pack-seed.mjs.
-- Do not edit this file directly.
begin;

${packs.map(renderPack).join("\n\n")}

${renderCurrentPointers(packs)}

commit;
`;
}

export function readPackManifest(root = ROOT, file = "old-friend-v1.json") {
  return JSON.parse(
    readFileSync(path.join(root, "content/packs", file), "utf8"),
  );
}

function readAllPackManifests(root = ROOT) {
  return readdirSync(path.join(root, "content/packs"))
    .filter((file) => /-v\d+\.json$/.test(file))
    .sort()
    .map((file) => readPackManifest(root, file));
}

export function readPackManifests(root = ROOT) {
  const manifests = readAllPackManifests(root);
  const latestBySlug = new Map();
  for (const manifest of manifests) {
    const version = Number.parseInt(
      manifest.version.match(/-v(\d+)$/)?.[1],
      10,
    );
    const current = latestBySlug.get(manifest.slug);
    if (!current || version > current.version) {
      latestBySlug.set(manifest.slug, { manifest, version });
    }
  }
  return [...latestBySlug.values()]
    .map(({ manifest }) => manifest)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function readPackSeedManifests(root = ROOT) {
  return readAllPackManifests(root).sort(
    (left, right) =>
      left.slug.localeCompare(right.slug) ||
      left.version.localeCompare(right.version),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.stdout.write(renderPackSeed(readPackSeedManifests()));
}
