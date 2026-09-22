# -*- coding: utf-8 -*-
import re

SRC = r'C:/Users/ASUS/WorkBuddy/2026-09-20-02-14-08/clone_work/src/learning-goal.html'
html = open(SRC, encoding='utf-8').read()

# 提取 script 块
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.S)
main = max(scripts, key=len)
open(r'C:/Users/ASUS/WorkBuddy/2026-09-20-02-14-08/clone_work/main.js', 'w', encoding='utf-8').write(main)
print('script blocks:', len(scripts), 'main size:', len(main))

print()
print('=== 函数清单 ===')
for m in re.finditer(r'function\s+([A-Za-z_$][\w$]*)\s*\(', main):
    print(m.group(1), end=' ')
print()
print()
print('=== state 定义 ===')
i = main.find('var state')
print(main[i:i+600] if i >= 0 else 'not found')
print()
print('=== save 函数 ===')
i = main.find('function save(')
print(main[i:i+500] if i >= 0 else 'not found')
print()
print('=== 周记 notes 相关 ===')
for m in sorted(set(re.findall(r'state\.(notes|weeklyNotes|reviews)[\w.]*', main))):
    print(m)
for m in sorted(set(re.findall(r'.{0,60}noteKeep.{0,60}', main)))[:5]:
    print(repr(m))
