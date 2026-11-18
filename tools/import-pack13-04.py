import json, pathlib, sys
G = pathlib.Path(__file__).resolve().parents[1]
out = G / 'public/data/content'
D = 'D:/downloads/'
src = {'tutorial_2': '1794993891566', 'loading_tips_3': '1794993922662',
       'objective_hints_2': '1794993956278', 'class_banter_2': '1794993980380'}
bad, res = [], {}
for k, f in src.items():
    raw = open(D + 'gemini-code-' + f + '.json', encoding='utf8').read()
    if '\ufffd' in raw: bad.append(k + ' U+FFFD')
    res[k] = json.loads(raw)[k]
L = lambda fn: json.load(open(out / (fn + '.json'), encoding='utf8'))
tut, tips, ban = L('tutorial'), L('loading-tips'), L('class-banter')
t2 = res['tutorial_2']
if len(t2) != 20: bad.append('tut count %d' % len(t2))
if {e['step'] for e in t2} & {e['step'] for e in tut}: bad.append('tut step overlap')
if {e['hint_key'] for e in t2} & {e['hint_key'] for e in tut}: bad.append('tut hint overlap')
if len(res['loading_tips_3']) != 80: bad.append('tips count %d' % len(res['loading_tips_3']))
if {e['tip'] for e in res['loading_tips_3']} & {e['tip'] for e in tips}: bad.append('tip overlap')
oh = res['objective_hints_2']
if len(oh) != 46 or any(len(v) != 2 for v in oh.values()): bad.append('obj shape')
cb = res['class_banter_2']
if set(cb) != set(ban) or any(len(v) != 20 for v in cb.values()): bad.append('banter shape')
for c in ban:
    if set(cb.get(c, [])) & set(ban[c]): bad.append('banter overlap ' + c)
print('problems:', bad)
if bad: sys.exit(1)
if '--write' in sys.argv:
    def w(fn, v): json.dump(v, open(out / (fn + '.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    w('tutorial', tut + t2)
    w('loading-tips', tips + res['loading_tips_3'])
    for c in ban: ban[c] += cb[c]
    w('class-banter', ban)
    w('objective-hints-2', oh)
    print('written', len(tut) + len(t2), len(tips) + 80, {c: len(v) for c, v in ban.items()}, len(oh))
