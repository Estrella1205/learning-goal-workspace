# -*- coding: utf-8 -*-
import re

SRC = r'C:/Users/ASUS/WorkBuddy/2026-09-20-02-14-08/clone_work/src/learning-goal.html'
html = open(SRC, encoding='utf-8').read()

print('=== localStorage keys ===')
for op, key in re.findall(r"localStorage\.((?:getItem|setItem|removeItem))\(\s*['\"]([^'\"]+)['\"]", html):
    print(op, key)

print()
print('=== pullRemote / push 数据流 ===')
i = html.find('function pullRemote')
print(html[i:i+2400])

print()
print('=== 周复盘保存逻辑 ===')
for kw in ['保持', 'weekly', 'review', 'weeklyReview', '周复盘']:
    for m in sorted(set(re.findall(r'.{0,70}' + kw + r'.{0,70}', html)))[:4]:
        print(kw, '->', repr(m[:150]))
    print()
