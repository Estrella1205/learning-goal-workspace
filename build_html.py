# -*- coding: utf-8 -*-
"""把同款页面升级为三表全量在线同步版本，输出最终 HTML。"""
import json
import re
import sys

WORK = r"C:/Users/ASUS/WorkBuddy/2026-09-20-02-14-08/clone_work"
SRC = WORK + "/src/learning-goal.html"
OUT = WORK + "/learning-goal-final.html"

tables = json.load(open(WORK + "/tables_result.json", encoding="utf-8"))
DB_GOALS, DB_LOGS, DB_WEEKS = tables["goals"], tables["logs"], tables["weeks"]
assert DB_GOALS and DB_LOGS and DB_WEEKS, "table ids missing"

html = open(SRC, encoding="utf-8").read()

# ---------- 1. 清理来源页面的节点标记（惰性 ID，避免跨页混淆） ----------
html = re.sub(r' data-page-node-id="[^"]*"', "", html)
html = re.sub(r"<!--pnid:[^>]*-->", "", html)

# ---------- 2. body 绑定标注指向打卡表 ----------
old_body = '<body data-sp-bindable="database" data-sp-database-id="yOmp5ctpMiusQWfUsOzwc5">'
new_body = f'<body data-sp-bindable="database" data-sp-database-id="{DB_LOGS}">'
assert html.count(old_body) == 1, "body tag anchor"
html = html.replace(old_body, new_body)

# ---------- 3. Hero：同步状态胶囊 ----------
anchor_chip = '<div class="hero-chips" id="heroChips"></div>'
assert html.count(anchor_chip) == 1, "heroChips anchor"
html = html.replace(
    anchor_chip,
    anchor_chip
    + '\n    <div class="sync-chip" id="syncChip" role="status" aria-live="polite" title="点击重新同步"><span class="sync-dot" id="syncDotTop"></span><span id="syncTextTop">检查同步状态…</span></div>',
)

# ---------- 4. 我的：云同步卡片 ----------
anchor_mine = '<section aria-hidden="true" aria-labelledby="tab-mine" class="tab-panel" id="panel-mine" role="tabpanel">'
assert html.count(anchor_mine) == 1, "panel-mine anchor"
cloud_card = anchor_mine + """
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--green)"></span>云同步</div>
      <div class="sync-row"><span class="sync-dot" id="syncDot"></span><span id="syncText">检查同步状态…</span><span class="sync-time" id="syncTime"></span></div>
      <div class="mine-list" style="margin-top:10px">
        <button class="mine-btn" id="btnResync">
          <svg fill="none" height="17" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" viewBox="0 0 24 24" width="17"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
          重新同步
        </button>
        <button class="mine-btn" id="btnClearSample">
          <svg fill="none" height="17" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" viewBox="0 0 24 24" width="17"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          清空示例数据
        </button>
      </div>
    </div>"""
html = html.replace(anchor_mine, cloud_card)

# ---------- 5. 「关于你的数据」文案更新 ----------
li1 = "<li>数据云端保存，多设备登录同一账号即可同步，不会因换设备或清缓存丢失。</li>"
assert html.count(li1) == 1, "li1 anchor"
html = html.replace(
    li1,
    "<li>数据存在「学习目标 / 每日打卡记录 / 每周复盘」三张在线数据表中，新建目标、打卡、补记、删除、保存复盘都会即时写回云端，换设备或换浏览器打开数据都在。</li>",
)
li2 = "<li>未登录时数据会降级保存在本机浏览器，登录后自动同步到云端。</li>"
assert html.count(li2) == 1, "li2 anchor"
html = html.replace(
    li2,
    "<li>网络不可用或写入失败时，改动会暂存在本机浏览器并自动重试，不会静默丢失；可在上方「云同步」查看状态并手动重新同步。</li>",
)

# ---------- 6. CSS 追加 ----------
css_add = """
  /* 云同步状态 */
  .sync-chip{display:inline-flex;align-items:center;gap:7px;margin-top:14px;padding:6px 14px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:12.5px;color:var(--ink-2);box-shadow:var(--shadow);width:fit-content;cursor:pointer}
  .sync-chip .sync-dot{width:8px;height:8px}
  .sync-row{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ink-2);flex-wrap:wrap}
  .sync-dot{width:9px;height:9px;border-radius:50%;background:var(--ink-3);flex:none}
  .sync-dot.ok{background:#10b981}
  .sync-dot.busy{background:#818cf8;animation:syncPulse 1.1s ease-in-out infinite}
  .sync-dot.fail{background:#ef4444}
  .sync-dot.off{background:#f59e0b}
  .sync-time{margin-left:auto;font-size:12px;color:var(--ink-3)}
  .mine-btn svg{flex:none}
  @keyframes syncPulse{0%,100%{opacity:1}50%{opacity:.35}}
"""
i_style_end = html.find("</style>")
assert i_style_end > 0
html = html[:i_style_end] + css_add + html[i_style_end:]

# ---------- 7. JS：替换同步层 ----------
sync_code = open(WORK + "/sync_layer.js", encoding="utf-8").read()
sync_code = sync_code.replace("{DB_GOALS}", DB_GOALS).replace("{DB_LOGS}", DB_LOGS).replace("{DB_WEEKS}", DB_WEEKS)

p1_start = html.find("/* ================= Database SDK 接入 ================= */")
p1_end_marker = 'console.warn("[database] " + reason);\n}'
p1_end = html.find(p1_end_marker, p1_start)
assert p1_start > 0 and p1_end > p1_start, "sync block anchor"
p1_end += len(p1_end_marker)
html = html[:p1_start] + sync_code + html[p1_end:]


def patch(old, new, label):
    global html
    n = html.count(old)
    assert n == 1, f"anchor {label} count={n}"
    html = html.replace(old, new)


# ---------- 8. blankState 增加 weekIds ----------
patch(
    'return { version:2, seedVersion:SEED_VERSION, goals:[], logs:[], notes:{}, seeded:false, backupDismissedAt:null, createdAt:todayStr() };',
    'return { version:2, seedVersion:SEED_VERSION, goals:[], logs:[], notes:{}, weekIds:{}, seeded:false, backupDismissedAt:null, createdAt:todayStr() };',
    "blankState",
)

# ---------- 9. migrate 兼容 weekIds ----------
patch(
    "  data.notes=nn;\n  if(data.meta",
    '  data.notes=nn;\n  if(!data.weekIds || typeof data.weekIds!=="object" || Array.isArray(data.weekIds)) data.weekIds={};\n  if(data.meta',
    "migrate",
)

# ---------- 10. validateState 保留示例标记 ----------
patch(
    "cleanNotes[k]={keep:cleanText(n.keep,100),problem:cleanText(n.problem,100),try:cleanText(n.try,100),next:cleanText(n.next,100)};",
    "cleanNotes[k]={keep:cleanText(n.keep,100),problem:cleanText(n.problem,100),try:cleanText(n.try,100),next:cleanText(n.next,100),sample:!!n.sample};",
    "cleanNotes",
)

# ---------- 11. load() → loadLocal()（去掉本地 seed 与旧升级逻辑） ----------
old_load = """function load(){
  var raw=null, sourceKey=LS_KEY;
  try{
    raw=localStorage.getItem(LS_KEY);
    if(!raw){
      for(var i=0;i<LEGACY_KEYS.length;i++){
        raw=localStorage.getItem(LEGACY_KEYS[i]);
        if(raw){ sourceKey=LEGACY_KEYS[i]; break; }
      }
    }
    if(raw){
      state=validateState(JSON.parse(raw));
      var upgraded=false;
      /* 旧版内置演示数据（seedVersion 落后）自动升级为新演示内容，用户自建目标与记录保留 */
      if(state.seeded===true && state.seedVersion < SEED_VERSION){
        state.goals=state.goals.filter(function(g){ return SEED_IDS.indexOf(g.id)<0; });
        state.logs=state.logs.filter(function(l){ return SEED_IDS.indexOf(l.goalId)<0; });
        seed(); state.seedVersion=SEED_VERSION; upgraded=true;
      }
      if(save(true)){
        if(sourceKey!==LS_KEY) bootNotice="已自动迁移旧版数据";
        else if(upgraded) bootNotice="内置内容已更新";
      }
      return;
    }
  }catch(e){
    if(raw){
      try{ localStorage.setItem(BROKEN_KEY,raw); }catch(ignore){}
      bootNotice="检测到异常数据，已保留原始副本并载入内置内容";
    }else{
      bootNotice="浏览器存储不可用，本次修改可能无法保留";
    }
  }
  state=blankState();
  seed();
  save(true);
}"""
new_load = """function loadLocal(){
  var raw=null;
  try{
    raw=localStorage.getItem(LS_KEY);
    if(!raw){
      for(var i=0;i<LEGACY_KEYS.length;i++){
        raw=localStorage.getItem(LEGACY_KEYS[i]);
        if(raw) break;
      }
    }
    if(raw){ state=validateState(JSON.parse(raw)); return; }
  }catch(e){
    if(raw){ try{ localStorage.setItem(BROKEN_KEY,raw); }catch(ignore){} }
  }
  state=blankState();
}"""
patch(old_load, new_load, "load")

# ---------- 12. seed() 标记示例数据 ----------
patch(
    """    var o={ id:uid(), goalId:g, date:addDays(t,d), amount:a, minutes:m||null, ts:now+d*86400000 };
    if(mk) o.makeup=true;
    L.push(o);""",
    """    var o={ id:uid(), goalId:g, date:addDays(t,d), amount:a, minutes:m||null, ts:now+d*86400000 };
    if(mk) o.makeup=true;
    o.sample=true;
    L.push(o);""",
    "seed-log",
)

goal_push_re = re.compile(r'(\{ id:"seed-g\d".*?) \}\);')
count_goal_push = len(goal_push_re.findall(html))
assert count_goal_push == 6, f"seed goals count={count_goal_push}"
html = goal_push_re.sub(r"\1, sample:true });", html)

patch('next:"如果周末想赖床，就先把电脑放桌上" };', 'next:"如果周末想赖床，就先把电脑放桌上", sample:true };', "seed-note1")
patch('next:"如果早上起晚了，就利用午休补 10 个" };', 'next:"如果早上起晚了，就利用午休补 10 个", sample:true };', "seed-note2")

# ---------- 13. doCheckin 写回 ----------
patch(
    """  state.logs.push(rec);
  pushRemote(rec, g);
  save(); render();""",
    """  state.logs.push(rec);
  save(); render();
  enqueueAdd("logs", rec.id, logProps(rec, g));""",
    "doCheckin",
)

# ---------- 14. 删除记录写回 ----------
patch(
    """        state.logs=state.logs.filter(function(l){return l.id!==id;});
        save(); render(); toast("已删除该条记录");""",
    """        state.logs=state.logs.filter(function(l){return l.id!==id;});
        enqueueDelete("logs", id);
        save(); render(); toast("已删除该条记录");""",
    "dellog",
)

# ---------- 15. 删除目标写回 ----------
patch(
    """      armConfirm(t,"确认删除？",function(){
        var g=goalById(gid);
        state.goals=state.goals.filter(function(x){return x.id!==gid;});
        state.logs=state.logs.filter(function(l){return l.goalId!==gid;});
        save(); render(); toast("已删除「"+(g?g.name:"")+"」及其全部记录");
      });""",
    """      armConfirm(t,"确认删除？",function(){
        var g=goalById(gid);
        var goneLogs=state.logs.filter(function(l){return l.goalId===gid;}).map(function(l){return l.id;});
        state.goals=state.goals.filter(function(x){return x.id!==gid;});
        state.logs=state.logs.filter(function(l){return l.goalId!==gid;});
        enqueueDelete("goals", gid);
        goneLogs.forEach(function(rid){ enqueueDelete("logs", rid); });
        save(); render(); toast("已删除「"+(g?g.name:"")+"」及其全部记录");
      });""",
    "delgoal",
)

# ---------- 16. 目标新建/编辑写回 ----------
patch(
    """    if(editingGoalId){
      var g=goalById(editingGoalId);
      g.name=name; g.unit=unit; g.total=total; g.deadline=dl; g.color=pickedColor;
      g.obstacle=$("fObstacle").value.trim(); g.plan=$("fPlan").value.trim();
      toast("目标已更新");
    }else{
      state.goals.push({ id:uid(), name:name, unit:unit, total:total, deadline:dl, color:pickedColor, createdAt:todayStr(), obstacle:$("fObstacle").value.trim(), plan:$("fPlan").value.trim() });
      toast("已创建目标「"+name+"」");
    }
    save(); closeGoalModal(); render();""",
    """    if(editingGoalId){
      var g=goalById(editingGoalId);
      g.name=name; g.unit=unit; g.total=total; g.deadline=dl; g.color=pickedColor;
      g.obstacle=$("fObstacle").value.trim(); g.plan=$("fPlan").value.trim();
      enqueueGoalUpdate(g);
      toast("目标已更新");
    }else{
      var ng={ id:uid(), name:name, unit:unit, total:total, deadline:dl, color:pickedColor, createdAt:todayStr(), obstacle:$("fObstacle").value.trim(), plan:$("fPlan").value.trim() };
      state.goals.push(ng);
      enqueueGoalAdd(ng);
      toast("已创建目标「"+name+"」");
    }
    save(); closeGoalModal(); render();""",
    "modalSave",
)

# ---------- 17. 周报复盘保存写回 ----------
patch(
    """  $("btnSaveNote").addEventListener("click",function(){
    var r=currentWeekRange();
    state.notes[r.start]=readNoteForm();
    save(); toast("复盘已保存到本周");
  });""",
    """  $("btnSaveNote").addEventListener("click",function(){
    var r=currentWeekRange();
    state.notes[r.start]=readNoteForm();
    upsertWeekNote(r.start);
    save(); toast("复盘已保存并同步");
  });""",
    "btnSaveNote",
)
patch(
    """  $("btnGenReport").addEventListener("click",function(){
    var r=currentWeekRange();
    state.notes[r.start]=readNoteForm(); save();""",
    """  $("btnGenReport").addEventListener("click",function(){
    var r=currentWeekRange();
    state.notes[r.start]=readNoteForm(); upsertWeekNote(r.start); save();""",
    "btnGenReport",
)

# ---------- 18. 清空全部走云端 ----------
patch(
    '      if(v==="清空"){ state=blankState(); save(); render(); toast("已清空全部数据"); }',
    '      if(v==="清空"){ clearAllData(); }',
    "btnClearAll",
)

# ---------- 19. bind 增加同步按钮 ----------
patch(
    """  $("btnCopyReport").addEventListener("click",function(){
    copyText($("reportPreview").textContent,"周报已复制，去粘贴分享吧");
  });
}""",
    """  $("btnCopyReport").addEventListener("click",function(){
    copyText($("reportPreview").textContent,"周报已复制，去粘贴分享吧");
  });

  /* 云同步 */
  $("btnResync").addEventListener("click",function(){ manualResync(); });
  var cs=$("btnClearSample");
  if(cs) cs.addEventListener("click",function(){ armConfirm(cs,"确认清空示例？",clearSampleData); });
  var chip=$("syncChip");
  if(chip) chip.addEventListener("click",function(){ manualResync(); });
}""",
    "bind-additions",
)

# ---------- 20. 启动块 ----------
patch(
    """/* ================= 启动 ================= */
load();
bind();
render();
pullRemote(function(ok){ if(ok){ render(); } });
if(bootNotice) setTimeout(function(){ toast(bootNotice); },100);
})();""",
    """/* ================= 启动 ================= */
boot();
})();""",
    "startup",
)

# ---------- 21. 示例裁剪：SEED_IDS 只留 3 个 ----------
patch(
    'var SEED_IDS = ["seed-g1","seed-g2","seed-g3","seed-g4","seed-g5","seed-g6"];',
    'var SEED_IDS = ["seed-g1","seed-g2","seed-g3"];',
    "seed-ids-trim",
)

# ---------- 22. 示例裁剪：删除 g4/g5/g6 三个演示目标块 ----------
g456 = re.compile(
    r"\n  /\* g4 读完《刻意练习》.*?log\(\"seed-g6\",-17,Math\.max\(1,190-g6sum\),35\);\n",
    re.S,
)
assert len(g456.findall(html)) == 1, "g456 block anchor"
html = g456.sub("\n", html)

# ---------- 23. 示例裁剪：周报复盘不再提及已删目标 ----------
patch(
    'keep:"《刻意练习》按计划读完，最后一周每天补到 10 页"',
    'keep:"背英语单词按计划推进，累计已背一千多个"',
    "note-keep-rewrite",
)

open(OUT, "w", encoding="utf-8", newline="\n").write(html)
print("BUILD_OK size:", len(html))
print("ids:", DB_GOALS, DB_LOGS, DB_WEEKS)
