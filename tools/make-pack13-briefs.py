import json, pathlib
C = pathlib.Path(__file__).resolve().parents[1] / 'public/data/content'
L = lambda f: json.load(open(C / (f + '.json'), encoding='utf8'))


def s(f, n=3):
    d = L(f)
    d = d[:n] if isinstance(d, list) else dict(list(d.items())[:n])
    return json.dumps(d, ensure_ascii=False, indent=1)


enemies = [e['enemy'] for e in L('enemy-barks')]
towns = sorted({e['town'] for e in L('town-barks')})
bosses = [b['boss'] for b in L('boss-dialogue')]
missions = list(L('objective-hints').keys())
unq = [u['name'] for u in L('uniques') + L('uniques-2')]
sets = [x['name'] for x in L('item-sets')]
P = pathlib.Path(__file__).resolve().parents[2] / '.planning/gemini-pack-13'
P.mkdir(exist_ok=True)
HEAD = """# ПАК 13 — БРИФ {n}/5 — {t}

**Правило:** Забрави предишните задачи. Върни САМО JSON в ЕДИН файл `{f}` (code execution / Canvas / файл за изтегляне) + линк и 2 реда резюме. НЕ принтирай JSON-а. Ако не можеш файлове — върни го на порции `PART 1/N` (по 1–2 ключа на порция).

## Общ промпт
Ти си главен писател на **Thornvael** — тъмна фентъзи РПГ в реално време (герой + наемници; 4 акта: Border Fords, Redmarsh, Iron Coast, Crown and Ember; 4 класа: warrior, archer, mage, necromancer, всеки male/female). Тон: мрачен, сух, литературен. Всичко оригинално, без имена от други игри. **Целият текст на английски.** Само валиден JSON (UTF-8, без коментари/трейлинг запетаи, без символа U+FFFD), `id` kebab-case и уникални, спазвай лимитите. Всеки текст е УНИКАЛЕН и подхожда на ролята — без шаблон със сменено име. Не повтаряй реплики от примерите.

## Задача
Топ-ниво обект с ключовете по-долу + в края `"_self_check": {{"counts": {{}}, "violations": []}}`. Ключове: {k}.
{task}

## РЕФЕРЕНЦИИ (вградени — следвай формата точно; примерите са първите записи от съществуващите файлове)
{ref}
"""


def R(name, body):
    return f"\n### {name}\n```json\n{body}\n```\n"


rows = []
rows.append((1, 'barks', 'бойни и градски реплики', 'enemy_barks_2, town_barks_2, boss_dialogue_2, death_quotes_2',
"""- `enemy_barks_2`: 40 НОВИ врага с НОВИ kebab-case id (не от списъка по-долу; 10 на акт, в духа на акта). Формат като примера: `{enemy, aggro:[3], hurt:[2], death:[2]}`, реплики ≤ 60 знака; за нечовешките — *звукови описания*.
- `town_barks_2`: 120 реплики `{town, kind, line≤120}`; kind ∈ crowd|guard|merchant|child|drunk|priest|smith|beggar; по ≥10 на град (градове по-долу), не повтаряй примерите.
- `boss_dialogue_2`: 12 НОВИ босове (нови id, по 3 на акт): `{boss, name, act, intro≤260, phase_lines:[3, ≤140 всяка], defeat≤200}`.
- `death_quotes_2`: 60 цитата `{quote≤140, source}` (source = кой го е казал, напр. „a ferryman at Thornwick“), за екрана на смъртта.""",
R('enemy-barks.json (първи 3)', s('enemy-barks')) + R('town-barks.json (първи 4)', s('town-barks', 4)) + R('boss-dialogue.json (първи 1)', s('boss-dialogue', 1)) + R('death-quotes.json (първи 4)', s('death-quotes', 4)) + "\nВече покрити врагове: " + ', '.join(enemies) + "\nГрадове: " + ', '.join(towns) + "\nВече покрити босове: " + ', '.join(bosses) + "\n"))
rows.append((2, 'world', 'карта, NPC и случки', 'map_locations_3, field_npcs_2, random_events_2',
"""- `map_locations_3`: 40 нови места (по 10 на акт) `{id, name, act, region_hint, blurb≤180, discovered_line≤160}`; region_hint ∈ north|south|east|west|center. Не повтаряй имена от примерите.
- `field_npcs_2`: 24 нови полеви NPC (по 6 на акт) `{id, name, act, role, look≤160, prop≤120, line_first≤160, line_repeat≤120, line_farewell≤100}` — следвай точните имена на полетата от примера; ролите различни (peddler, deserter, pilgrim, tinker, ferryman, hermit, …).
- `random_events_2`: 30 нови случки (по ≥6 на акт); формат като примера; `trigger` ∈ shrine|ambush|chest|npc|ruin|camp; всяка с 2–3 `choices` и ясни последствия в текста (без числа за механика — само описателно).""",
R('map-locations-2.json (първи 2)', s('map-locations-2', 2)) + R('field-npcs.json (първи 2)', s('field-npcs', 2)) + R('random-events.json (първи 2)', s('random-events', 2))))
rows.append((3, 'items', 'уникални и сетове', 'uniques_3, item_sets_2, item_flavor_2',
"""- `uniques_3`: 48 нови уникати (по 12 на акт; по равно за warrior/archer/mage/necromancer; tier 1–4 според акта). Формат като примера (`id, name, base, class, tier, stats, flavor≤100, inspect≤220`). `base` — предмет по име от item-flavor (списък по-долу). Статистиките в мащаба на примерите (tier 1 малки, tier 4 ~3× по-големи). Без дублиране на имена от съществуващите уникати.
- `item_sets_2`: 10 нови сета (по 2–3 на акт, поне един за всеки клас), същия формат като примера, включително всички полета за бонуси.
- `item_flavor_2`: 80 нови записа `{name, flavor≤120}` за обикновени предмети, чиито имена не са в списъка по-долу (оръжия/брони/украшения за 4-те акта).""",
R('uniques-2.json (първи 2)', s('uniques-2', 2)) + R('item-sets.json (първи 1)', s('item-sets', 1)) + R('item-flavor.json (първи 5)', s('item-flavor', 5)) + "\nСъществуващи имена в item-flavor (не повтаряй): " + ', '.join(L('item-flavor').keys()) + "\nСъществуващи уникати: " + ', '.join(unq) + "\nСъществуващи сетове: " + ', '.join(sets) + "\n"))
rows.append((4, 'guidance', 'обучение, съвети, цели', 'tutorial_2, loading_tips_3, objective_hints_2, class_banter_2',
"""- `tutorial_2`: 20 допълнителни стъпки за напреднали механики (формации, групи, магии, инвентар, търговия, наемници, занаяти, рифтове, трудности…) `{step, title≤40, text≤200, hint_key}`; `step` започва от 15.
- `loading_tips_3`: 80 нови съвета `{tip≤140, category, act}`; категории: squad, combat, magic, economy, exploration, lore, merc, craft; act 0 = общ.
- `objective_hints_2`: по 2 допълнителни подсказки за всяка мисия (всички ключове от списъка по-долу): `{"<mission-id>": ["hint≤140", "hint≤140"]}` — първата ненатрапчива, втората прямо казва какво да се направи.
- `class_banter_2`: ключове warrior|archer|mage|necromancer → по 20 нови кратки реплики (≤100 знака) за бой/пътуване.""",
R('tutorial.json (първи 3)', s('tutorial')) + R('loading-tips.json (първи 4)', s('loading-tips', 4)) + R('class-banter.json (warrior, първи 3)', json.dumps({k: v[:3] for k, v in list(L('class-banter').items())[:1]}, ensure_ascii=False, indent=1)) + R('objective-hints.json (първи 3)', s('objective-hints')) + "\nId-та на мисии: " + ', '.join(missions) + "\n"))
ae = L('act-endings')[0]
ae = {**ae, 'text': ae['text'][:300] + '…'}
rows.append((5, 'spells', 'заклинания, герои и епилози', 'spell_text_2, hero_voices_2, act_epilogues',
"""- `spell_text_2`: 40 нови заклинания/умения (по 10 на клас) `{name, class, tooltip≤180, flavor≤160, cast_line≤60}`; tooltips с примерни числа (mana, CD); без имена от списъка по-долу.
- `hero_voices_2`: 8 записа (warrior|archer|mage|necromancer × male|female): `{hero_id, level_up:[5], low_hp:[4], victory:[4], idle:[6], loot_rare:[4]}`; реплики ≤ 90 знака, различни по характер за всеки герой.
- `act_epilogues`: 4 епилога (по един за акт) `{act, title≤50, text≤700}` — какво става със света след акта; различни от съществуващите крайни текстове.""",
R('spell-text.json (първи 2)', s('spell-text', 2)) + R('hero-voices.json (първи 1)', s('hero-voices', 1)) + R('act-endings.json (първи 1, съкратен)', json.dumps([ae], ensure_ascii=False, indent=1)) + "\nСъществуващи имена на заклинания: " + ', '.join(x['name'] for x in L('spell-text')) + "\n"))

fs = []
for n, slug, t, keys, task, ref in rows:
    f = f'gemini-pack-13-{n:02d}-{slug}.json'
    (P / f'BRIEF-{n:02d}-{slug}.md').write_text(HEAD.format(n=n, t=t, f=f, k=keys, task=task, ref=ref), encoding='utf8')
    fs.append(f)
tab = "\n".join(f"| {r[0]:02d} | {r[2]} | `{f}` | {r[3]} |" for r, f in zip(rows, fs))
(P / 'README.md').write_text("# Pack 13 — 5 брифа (по един за Gemini)\n\nДавай ги ЕДИН ПО ЕДИН в НОВ чат. Всеки връща ЕДИН файл — запиши го в `D:\\downloads\\`.\n\n| № | тема | файл за връщане | ключове |\n|---|---|---|---|\n" + tab + "\n", encoding='utf8')
print(fs)
