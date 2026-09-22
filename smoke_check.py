import re, sys, json, subprocess, os

ROOT = os.path.dirname(os.path.abspath(__file__))
NODE = r"C:\Users\ASUS\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
HTML = os.path.join(ROOT, "learning-goal-final.html")

src = open(HTML, encoding="utf-8").read()

# 提取所有内联 script（不含 src=）
scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", src, re.S)
print("inline scripts:", len(scripts))

# 语法校验主脚本（最长的那个）
main = max(scripts, key=len)
print("main script len:", len(main))
open(os.path.join(ROOT, "_main_check.js"), "w", encoding="utf-8").write(main)

r = subprocess.run([NODE, "--check", os.path.join(ROOT, "_main_check.js")], capture_output=True, text=True)
print("SYNTAX:", "OK" if r.returncode == 0 else "FAIL")
if r.returncode != 0:
    print(r.stderr[:3000])
    sys.exit(1)

# 冒烟自检关键点
checks = []
def has(pat, label):
    ok = re.search(pat, src) is not None
    checks.append((label, ok))

has(r'id="syncChip"', "syncChip 存在")
has(r'id="btnResync"', "btnResync 存在")
has(r'id="btnClearSample"', "btnClearSample 存在")
has(r'data-sp-bindable="database"', "bindable 标注")
has(r'data-sp-database-id="n8NSQBqFPeSwXyamkoqMPu"', "body 绑定打卡表")
has(r'XFv6gwynu5aQQYl9KH4Vwl', "目标表 ID 字面量")
has(r'n8NSQBqFPeSwXyamkoqMPu', "打卡表 ID 字面量")
has(r'VxyRa8pFHRea3D487MpHKG', "周报表 ID 字面量")
has(r'data-page-node-id', "无残留 node-id 标记(应为 False)")
has(r'pnid:', "无残留 pnid 注释(应为 False)")
has(r'\{DB_GOALS\}|\{DB_LOGS\}|\{DB_WEEKS\}', "无残留占位符(应为 False)")

for label, ok in checks:
    print(("PASS " if ok else ("PASS-NOT " if "应为 False" in label else "FAIL ")) + label)

# 渲染函数互调检查（铁律9）：粗查 render 函数体内是否调用其他 render
mainjs = main
render_funcs = re.findall(r"function (render\w+)\(", mainjs)
print("render funcs:", render_funcs)
for rf in render_funcs:
    body_m = re.search(r"function " + rf + r"\(.*?\n\}", mainjs, re.S)
    if body_m:
        body = body_m.group(0)
        # 去掉自己的第一行定义再找其他 render 调用
        inner = body.split("\n", 1)[1] if "\n" in body else body
        for other in render_funcs:
            if other != rf and re.search(r"(?<![\w$.])" + other + r"\(", inner):
                print("WARN: render func", rf, "calls", other)

print("SMOKE_OK")
