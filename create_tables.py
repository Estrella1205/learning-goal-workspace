# -*- coding: utf-8 -*-
"""创建三张学习目标管理台数据表。token 从 stdin 读取，不落地。"""
import json
import subprocess
import sys

SKILL = r"E:/app/workbuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/library/database/create_database.py"

SCHEMAS = [
    {"key": "goals", "schema": {
        "title": "学习目标",
        "properties": [
            {"name": "目标名称", "config": {"text": ""}},
            {"name": "单位", "config": {"text": ""}},
            {"name": "总量", "config": {"number": {"decimalPlaces": 2, "useSeparate": False}}},
            {"name": "截止日期", "config": {"date": "2026-01-01T00:00:00Z"}},
            {"name": "创建日期", "config": {"date": "2026-01-01T00:00:00Z"}},
            {"name": "配色", "config": {"text": ""}},
            {"name": "障碍预案", "config": {"text": ""}},
            {"name": "对策", "config": {"text": ""}},
            {"name": "状态", "config": {"select": {"options": [{"text": "进行中"}, {"text": "已完成"}, {"text": "已放弃"}]}}},
            {"name": "示例数据", "config": {"checkbox": False}},
        ],
    }},
    {"key": "logs", "schema": {
        "title": "每日打卡记录",
        "properties": [
            {"name": "日期", "config": {"date": "2026-01-01T00:00:00Z"}},
            {"name": "目标ID", "config": {"text": ""}},
            {"name": "目标名", "config": {"text": ""}},
            {"name": "打卡量", "config": {"number": {"decimalPlaces": 2, "useSeparate": False}}},
            {"name": "单位", "config": {"text": ""}},
            {"name": "分钟数", "config": {"number": {"decimalPlaces": 0, "useSeparate": False}}},
            {"name": "补记", "config": {"checkbox": False}},
            {"name": "示例数据", "config": {"checkbox": False}},
        ],
    }},
    {"key": "weeks", "schema": {
        "title": "每周复盘",
        "properties": [
            {"name": "周起始", "config": {"date": "2026-01-01T00:00:00Z"}},
            {"name": "保持", "config": {"text": ""}},
            {"name": "问题", "config": {"text": ""}},
            {"name": "尝试", "config": {"text": ""}},
            {"name": "下周预案", "config": {"text": ""}},
            {"name": "示例数据", "config": {"checkbox": False}},
        ],
    }},
]


def main():
    token = sys.stdin.read().strip()
    out = {}
    for item in SCHEMAS:
        proc = subprocess.run(
            [sys.executable, SKILL, "--token-stdin", "--schema", json.dumps(item["schema"], ensure_ascii=False)],
            input=token, capture_output=True, text=True, encoding="utf-8",
        )
        stdout = (proc.stdout or "").strip()
        print(f"--- {item['key']} ---")
        print(stdout[:800])
        try:
            data = json.loads(stdout)
            out[item["key"]] = data.get("database_id", "")
        except Exception:
            out[item["key"]] = ""
    with open(r"C:/Users/ASUS/WorkBuddy/2026-09-20-02-14-08/clone_work/tables_result.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    ok = all(out.values())
    print("ALL_OK" if ok else "SOME_FAILED")


if __name__ == "__main__":
    main()
