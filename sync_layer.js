/* ================= Database SDK 接入：三表在线存储 · 双向同步 ================= */
/* 学习目标 / 每日打卡记录 / 每周复盘 三张资料库数据表；所有变更即时写回云端，
   本机 localStorage 仅作缓存与离线暂存；拉取失败/写入失败有明确提示并可重试。 */
var DB_GOALS = "{DB_GOALS}";   /* 学习目标 */
var DB_LOGS  = "{DB_LOGS}";    /* 每日打卡记录 */
var DB_WEEKS = "{DB_WEEKS}";   /* 每周复盘 */
var SAMPLE_FIELD = "示例数据";
var Q_KEY = "goal_workspace_v1_queue";
var KNOWN_KEY = "goal_workspace_v1_known";
var LASTOK_KEY = "goal_workspace_v1_lastok";
var sync = { db:null, ready:false, busy:false, failed:false, lastOk:Number(localStorage.getItem(LASTOK_KEY))||0, retryTimer:null };
var queue = qLoadQueue();
var known = qLoadKnown();

function dbIdOf(t){ return t==="goals"?DB_GOALS : t==="logs"?DB_LOGS : DB_WEEKS; }
function qLoadQueue(){ try{ var v=JSON.parse(localStorage.getItem(Q_KEY)||"[]"); return Array.isArray(v)?v:[]; }catch(e){ return []; } }
function qSaveQueue(){ try{ localStorage.setItem(Q_KEY, JSON.stringify(queue)); }catch(e){} }
function qLoadKnown(){ try{ var v=JSON.parse(localStorage.getItem(KNOWN_KEY)||"{}"); return (v&&typeof v==="object"&&!Array.isArray(v))?v:{}; }catch(e){ return {}; } }
function qSaveKnown(){ try{ localStorage.setItem(KNOWN_KEY, JSON.stringify(known)); }catch(e){} }
function isKnownId(table, id){
  var m = table==="goals"?known.goals : table==="logs"?known.logs : known.weeks;
  return !!(m && m[id]);
}

function initDb(){
  try{ if(window.__SMART_PAGE__ && window.__SMART_PAGE__.database){ sync.db = window.__SMART_PAGE__.database; sync.ready = true; } }catch(e){}
  if(sync.ready && document.body){
    document.body.setAttribute("data-sp-bindable","database");
    document.body.setAttribute("data-sp-database-id", DB_LOGS);
  }
}

/* ---- 拉全量：query 单次只回一页，必须按 startCursor 续翻（含防呆熔断） ---- */
function queryAllGoals(cursor, acc, guard){
  acc = acc || []; guard = guard || 0;
  if(guard > 200) return Promise.resolve(acc);
  return sync.db.query({ databaseId: "{DB_GOALS}", pageSize: 200, startCursor: cursor }).then(function(r){
    acc = acc.concat(r.results || []);
    var next = r.nextCursor;
    if(r.hasMore && next && next !== cursor && (r.results||[]).length) return queryAllGoals(next, acc, guard+1);
    return acc;
  });
}
function queryAllLogs(cursor, acc, guard){
  acc = acc || []; guard = guard || 0;
  if(guard > 200) return Promise.resolve(acc);
  return sync.db.query({ databaseId: "{DB_LOGS}", pageSize: 200, startCursor: cursor }).then(function(r){
    acc = acc.concat(r.results || []);
    var next = r.nextCursor;
    if(r.hasMore && next && next !== cursor && (r.results||[]).length) return queryAllLogs(next, acc, guard+1);
    return acc;
  });
}
function queryAllWeeks(cursor, acc, guard){
  acc = acc || []; guard = guard || 0;
  if(guard > 200) return Promise.resolve(acc);
  return sync.db.query({ databaseId: "{DB_WEEKS}", pageSize: 200, startCursor: cursor }).then(function(r){
    acc = acc.concat(r.results || []);
    var next = r.nextCursor;
    if(r.hasMore && next && next !== cursor && (r.results||[]).length) return queryAllWeeks(next, acc, guard+1);
    return acc;
  });
}

/* ---- 记录 ↔ 状态转换 ---- */
function d10(v){ return v ? String(v).slice(0,10) : ""; }
function s(v){ return v==null ? "" : String(v); }
function rowToGoal(r){
  var g = { id:r._id, name:s(r["目标名称"]), unit:s(r["单位"])||"个", total:Number(r["总量"])||0,
    deadline:d10(r["截止日期"])||todayStr(), createdAt:d10(r["创建日期"])||todayStr(), color:s(r["配色"])||COLORS[0],
    obstacle:s(r["障碍预案"]), plan:s(r["对策"]), sample:!!r[SAMPLE_FIELD] };
  if(!(g.total>0) || !g.name || COLORS.indexOf(g.color)<0) return null;
  return g;
}
function rowToLog(r){
  var m=r["分钟数"];
  var l = { id:r._id, goalId:s(r["目标ID"]), gname:s(r["目标名"]), date:d10(r["日期"])||todayStr(),
    amount:Number(r["打卡量"])||0, minutes:(m==null||m==="")?null:Number(m), makeup:!!r["补记"],
    sample:!!r[SAMPLE_FIELD], ts:Date.now() };
  if(!(l.amount>0) || l.minutes!=null && !(l.minutes>=0 && l.minutes<=1440)) return null;
  return l;
}
function rowToNote(r){
  return { key:d10(r["周起始"]), keep:s(r["保持"]), problem:s(r["问题"]), try:s(r["尝试"]),
    next:s(r["下周预案"]), sample:!!r[SAMPLE_FIELD], _id:r._id };
}
function goalProps(g){
  var p = { "目标名称":{text:g.name}, "单位":{text:g.unit}, "总量":{number:g.total},
    "截止日期":{date:g.deadline}, "创建日期":{date:g.createdAt}, "配色":{text:g.color},
    "障碍预案":{text:g.obstacle||""}, "对策":{text:g.plan||""}, "状态":{select:isComplete(g)?"已完成":"进行中"} };
  if(g.sample) p[SAMPLE_FIELD] = { checkbox:true };
  return p;
}
function logProps(l, g){
  var p = { "日期":{date:l.date}, "目标ID":{text:g?g.id:(l.goalId||"")}, "目标名":{text:g?g.name:(l.gname||"")},
    "打卡量":{number:l.amount}, "单位":{text:g?g.unit:""} };
  if(l.minutes!=null) p["分钟数"] = { number:l.minutes };
  if(l.makeup) p["补记"] = { checkbox:true };
  if(l.sample) p[SAMPLE_FIELD] = { checkbox:true };
  return p;
}
function weekProps(key, n){
  var p = { "周起始":{date:key}, "保持":{text:n.keep||""}, "问题":{text:n.problem||""},
    "尝试":{text:n.try||""}, "下周预案":{text:n.next||""} };
  if(n.sample) p[SAMPLE_FIELD] = { checkbox:true };
  return p;
}

/* ---- 待同步队列：本地先行，云端异步写回，失败自动重试 ---- */
function enqueueAdd(table, localId, props){
  queue = queue.filter(function(x){ return !(x.op==="add" && x.table===table && x.localId===localId); });
  queue.push({ op:"add", table:table, localId:localId, props:props });
  qSaveQueue(); updateSyncUI(); scheduleFlush();
}
function enqueueUpdate(table, recordId, props){
  var replaced=false;
  for(var i=0;i<queue.length;i++){
    var x=queue[i];
    if(x.table===table && (x.recordId===recordId || (x.op==="add" && x.localId===recordId))){
      x.props=props; replaced=true; break;
    }
  }
  if(!replaced) queue.push({ op:"update", table:table, recordId:recordId, props:props });
  qSaveQueue(); updateSyncUI(); scheduleFlush();
}
function enqueueDelete(table, recordId){
  var hadAdd=false, keep=[];
  for(var i=0;i<queue.length;i++){
    var x=queue[i];
    if(x.table===table && (x.localId===recordId || x.recordId===recordId)){
      if(x.op==="add") hadAdd=true;
      continue;
    }
    keep.push(x);
  }
  queue=keep;
  if(!hadAdd && isKnownId(table, recordId)) queue.push({ op:"delete", table:table, recordId:recordId });
  qSaveQueue(); updateSyncUI(); scheduleFlush();
}
function enqueueGoalAdd(g){ enqueueAdd("goals", g.id, goalProps(g)); }
function enqueueGoalUpdate(g){
  var pending=null;
  for(var i=0;i<queue.length;i++){ var x=queue[i]; if(x.op==="add"&&x.table==="goals"&&x.localId===g.id){ pending=x; break; } }
  if(pending){ pending.props=goalProps(g); qSaveQueue(); return; }
  if(isKnownId("goals", g.id)) enqueueUpdate("goals", g.id, goalProps(g));
  else enqueueAdd("goals", g.id, goalProps(g));
}
function upsertWeekNote(key){
  var n=state.notes[key]; if(!n) return;
  if(state.weekIds[key]) enqueueUpdate("weeks", state.weekIds[key], weekProps(key,n));
  else enqueueAdd("weeks", key, weekProps(key,n));
}

var flushTimer=null;
function scheduleFlush(){ if(flushTimer) return; flushTimer=setTimeout(function(){ flushTimer=null; flush(); }, 500); }
function flush(cb){
  if(!sync.ready || sync.busy){ if(cb)cb(false); return; }
  if(!queue.length){ if(cb)cb(true); return; }
  sync.busy=true; updateSyncUI();
  function step(){
    if(!queue.length){
      sync.busy=false; sync.failed=false; sync.lastOk=Date.now();
      try{ localStorage.setItem(LASTOK_KEY, String(sync.lastOk)); }catch(e){}
      updateSyncUI();
      if(cb)cb(true); return;
    }
    var op=queue[0], p=null;
    try{
      if(op.op==="add"){
        if(op.table==="goals") p=sync.db.addRecord({ databaseId: "{DB_GOALS}", properties: op.props }).then(function(res){ onAddOk(op,res); });
        else if(op.table==="logs") p=sync.db.addRecord({ databaseId: "{DB_LOGS}", properties: op.props }).then(function(res){ onAddOk(op,res); });
        else p=sync.db.addRecord({ databaseId: "{DB_WEEKS}", properties: op.props }).then(function(res){ onAddOk(op,res); });
      }else if(op.op==="update"){
        if(op.table==="goals") p=sync.db.updateRecord({ databaseId: "{DB_GOALS}", recordId: op.recordId, properties: op.props });
        else if(op.table==="logs") p=sync.db.updateRecord({ databaseId: "{DB_LOGS}", recordId: op.recordId, properties: op.props });
        else p=sync.db.updateRecord({ databaseId: "{DB_WEEKS}", recordId: op.recordId, properties: op.props });
      }else{
        if(op.table==="goals") p=sync.db.deleteRecord({ databaseId: "{DB_GOALS}", recordId: op.recordId });
        else if(op.table==="logs") p=sync.db.deleteRecord({ databaseId: "{DB_LOGS}", recordId: op.recordId });
        else p=sync.db.deleteRecord({ databaseId: "{DB_WEEKS}", recordId: op.recordId });
      }
    }catch(e){ p=null; }
    if(!p){ failFlush(); if(cb)cb(false); return; }
    p.then(function(){ queue.shift(); qSaveQueue(); step(); })
     .catch(function(){ failFlush(); if(cb)cb(false); });
  }
  step();
}
function failFlush(){
  sync.busy=false;
  if(!sync.failed) toast("云端同步失败，改动已暂存，稍后自动重试");
  sync.failed=true; updateSyncUI();
  if(sync.retryTimer) clearTimeout(sync.retryTimer);
  sync.retryTimer=setTimeout(function(){ sync.retryTimer=null; flush(); }, 15000);
}
/* add 确认后：把临时本地 id 换成云端记录 _id（含联动引用与队列内 props） */
function onAddOk(op, res){
  var newId = res && res.id ? res.id : null;
  if(!newId) return;
  var i;
  if(op.table==="goals"){
    state.goals.forEach(function(g){ if(g.id===op.localId) g.id=newId; });
    state.logs.forEach(function(l){ if(l.goalId===op.localId) l.goalId=newId; });
    for(i=0;i<queue.length;i++){
      var x=queue[i];
      if(x.table==="goals" && x.localId===op.localId) x.localId=newId;
      else if(x.table==="logs" && x.localId===op.localId){ x.localId=newId; if(x.props&&x.props["目标ID"]) x.props["目标ID"]={text:newId}; }
      else if(x.recordId===op.localId) x.recordId=newId;
      else if(x.props && x.props["目标ID"] && x.props["目标ID"].text===op.localId) x.props["目标ID"]={text:newId};
    }
    known.goals[newId]=1;
  }else if(op.table==="logs"){
    state.logs.forEach(function(l){ if(l.id===op.localId) l.id=newId; });
    for(i=0;i<queue.length;i++){
      var y=queue[i];
      if(y.table==="logs" && y.localId===op.localId) y.localId=newId;
      if(y.table==="logs" && y.recordId===op.localId) y.recordId=newId;
    }
    known.logs[newId]=1;
  }else{
    if(state.weekIds) state.weekIds[op.localId]=newId;
    known.weeks[newId]=1;
  }
  save(true);
}

/* ---- 拉取 + 合并：云端为准，保留本地待新增项 ---- */
function pullAll(cb){
  if(!sync.ready){ if(cb)cb(false,null); return; }
  if(sync.busy){ if(cb)cb(false,null); return; }
  sync.busy=true; updateSyncUI();
  Promise.all([ queryAllGoals(), queryAllLogs(), queryAllWeeks() ]).then(function(rs){
    var cg=[], cl=[], cw=[], i, o;
    for(i=0;i<rs[0].length;i++){ o=rowToGoal(rs[0][i]); if(o) cg.push(o); }
    for(i=0;i<rs[1].length;i++){ o=rowToLog(rs[1][i]); if(o) cl.push(o); }
    for(i=0;i<rs[2].length;i++){ o=rowToNote(rs[2][i]); if(o&&o.key) cw.push(o); }
    var wasEmpty = (cg.length===0 && cl.length===0 && cw.length===0);
    mergeCloud(cg, cl, cw);
    known={ goals:{}, logs:{}, weeks:{} };
    cg.forEach(function(g){ known.goals[g.id]=1; });
    cl.forEach(function(l){ known.logs[l.id]=1; });
    cw.forEach(function(w){ known.weeks[w._id]=1; });
    qSaveKnown();
    sync.busy=false; sync.failed=false; sync.lastOk=Date.now();
    try{ localStorage.setItem(LASTOK_KEY, String(sync.lastOk)); }catch(e){}
    updateSyncUI();
    if(cb)cb(true, wasEmpty);
  }).catch(function(){
    sync.busy=false; sync.failed=true; updateSyncUI();
    if(cb)cb(false, null);
  });
}
function mergeCloud(cg, cl, cw){
  function pendingAdd(table,id){
    for(var i=0;i<queue.length;i++){ var x=queue[i]; if(x.op==="add"&&x.table===table&&x.localId===id) return true; }
    return false;
  }
  var gmap={}, i;
  var goals=cg.slice();
  state.goals.forEach(function(g){ if(!gmap[g.id] && pendingAdd("goals",g.id)) goals.push(g); });
  var lmap={}, logs=cl.slice();
  state.logs.forEach(function(l){ if(!lmap[l.id] && pendingAdd("logs",l.id)) logs.push(l); });
  var byId={}, byName={};
  goals.forEach(function(g){ gmap[g.id]=g; byId[g.id]=g; if(g.name) byName[g.name]=g; });
  logs.forEach(function(l){ lmap[l.id]=l; });
  logs.forEach(function(l){
    if(!byId[l.goalId] && l.gname && byName[l.gname]) l.goalId=byName[l.gname].id;
  });
  logs=logs.filter(function(l){ return !!byId[l.goalId]; });
  var notes={}, weekIds={};
  cw.forEach(function(w){
    notes[w.key]={ keep:w.keep, problem:w.problem, try:w.try, next:w.next, sample:w.sample };
    weekIds[w.key]=w._id;
  });
  var localNotes=state.notes||{};
  Object.keys(localNotes).forEach(function(k){
    if(notes[k]==null && pendingAdd("weeks",k)) notes[k]=localNotes[k];
  });
  state.goals=goals; state.logs=logs; state.notes=notes; state.weekIds=weekIds;
}

/* ---- 双向同步：云端有变动（其他设备/表格端）时自动拉取刷新 ---- */
function bindOnUpdated(){
  if(!sync.ready || typeof sync.db.onUpdated!=="function") return;
  var updTimer=null;
  sync.db.onUpdated(function(payload){
    var ids=(payload&&payload.databaseIds)||[], hit=false;
    for(var i=0;i<ids.length;i++){ if(ids[i]===DB_GOALS||ids[i]===DB_LOGS||ids[i]===DB_WEEKS){ hit=true; break; } }
    if(!hit) return;
    if(updTimer) return;
    updTimer=setTimeout(function(){
      updTimer=null;
      if(sync.busy) return;
      flush(function(){ pullAll(function(ok){ if(ok) renderIfIdle(); }); });
    }, 600);
  });
}
function renderIfIdle(){
  var a=document.activeElement;
  if(a && a.closest && a.closest("main") && (a.tagName==="INPUT" || a.tagName==="SELECT" || a.tagName==="TEXTAREA")) return;
  render();
}

/* ---- 同步状态 UI（页面顶部 + 「我的」） ---- */
function updateSyncUI(){
  var dot=$("syncDot"), txt=$("syncText"), time=$("syncTime"), dot2=$("syncDotTop"), txt2=$("syncTextTop");
  var status, cls;
  if(!sync.ready){ status="离线模式 · 数据暂存本机"; cls="off"; }
  else if(sync.busy){ status="同步中…"; cls="busy"; }
  else if(sync.failed || queue.length>0){ status="待同步 "+queue.length+" 条 · 点此重试"; cls="fail"; }
  else { status="已同步"; cls="ok"; }
  if(dot) dot.className="sync-dot "+cls;
  if(txt) txt.textContent=status;
  if(dot2) dot2.className="sync-dot "+cls;
  if(txt2) txt2.textContent=status;
  if(time){
    if(sync.lastOk>0){ var d=new Date(sync.lastOk); time.textContent="上次同步 "+pad(d.getHours())+":"+pad(d.getMinutes()); }
    else time.textContent = sync.ready ? "尚未同步" : "";
  }
}
function manualResync(){
  if(!sync.ready){ toast("当前处于离线模式，无法连接云端"); return; }
  if(sync.busy){ toast("正在同步中，请稍候"); return; }
  toast("正在重新同步…");
  flush(function(){
    pullAll(function(ok){
      if(ok){ render(); toast("已与云端同步"); }
      else toast("同步失败，请检查网络后重试");
    });
  });
}

/* ---- 清空全部 / 清空示例 ---- */
function clearAllData(){
  var dels=[], i;
  for(i=0;i<state.goals.length;i++) dels.push({ op:"delete", table:"goals", recordId:state.goals[i].id });
  for(i=0;i<state.logs.length;i++) dels.push({ op:"delete", table:"logs", recordId:state.logs[i].id });
  var wk=state.weekIds||{};
  Object.keys(wk).forEach(function(k){ dels.push({ op:"delete", table:"weeks", recordId:wk[k] }); });
  dels=dels.filter(function(x){ return isKnownId(x.table, x.recordId); });
  state=blankState();
  queue=dels; qSaveQueue();
  try{ localStorage.removeItem(KNOWN_KEY); }catch(e){}
  known={ goals:{}, logs:{}, weeks:{} };
  save(); render(); updateSyncUI(); toast("已清空全部数据");
  flush();
}
function clearSampleData(){
  var seedGoalIds={}, i;
  for(i=0;i<state.goals.length;i++){ if(state.goals[i].sample) seedGoalIds[state.goals[i].id]=1; }
  var goneLogs=[];
  for(i=0;i<state.logs.length;i++){ if(seedGoalIds[state.logs[i].goalId]) goneLogs.push(state.logs[i].id); }
  state.goals=state.goals.filter(function(g){ return !g.sample; });
  state.logs=state.logs.filter(function(l){ return !seedGoalIds[l.goalId]; });
  Object.keys(state.notes).forEach(function(k){
    if(state.notes[k] && state.notes[k].sample){
      if(state.weekIds[k]) enqueueDelete("weeks", state.weekIds[k]);
      delete state.notes[k];
    }
  });
  Object.keys(seedGoalIds).forEach(function(gid){ enqueueDelete("goals", gid); });
  goneLogs.forEach(function(lid){ enqueueDelete("logs", lid); });
  save(); render(); toast("示例数据已清空");
  flush();
}

/* ---- 首次打开（云端为空且本地无数据）→ 载入示例并写入云端 ---- */
function seedToCloud(){
  var i;
  for(i=0;i<state.goals.length;i++) enqueueAdd("goals", state.goals[i].id, goalProps(state.goals[i]));
  for(i=0;i<state.logs.length;i++){
    var l=state.logs[i];
    enqueueAdd("logs", l.id, logProps(l, goalById(l.goalId)));
  }
  Object.keys(state.notes).forEach(function(k){ enqueueAdd("weeks", k, weekProps(k, state.notes[k])); });
}

/* ---- 启动：先渲染界面，再拉云端数据 ---- */
function boot(){
  initDb();
  loadLocal();
  if(!state) state=blankState();
  render();
  updateSyncUI();
  if(!sync.ready){
    if(state.goals.length===0 && state.logs.length===0){ seed(); save(true); render(); }
    updateSyncUI();
    return;
  }
  if(state.goals.length===0 && state.logs.length===0){
    var tz=$("todayZone");
    if(tz) tz.innerHTML='<div class="card empty">正在从云端加载数据…</div>';
  }
  bindOnUpdated();
  flush(function(){
    pullAll(function(ok, wasEmpty){
      if(ok){
        if(wasEmpty && state.goals.length===0 && state.logs.length===0){
          seed(); save(true); render(); seedToCloud();
          toast("已载入示例数据，并同步到云端");
        }else{
          render();
        }
      }else{
        if(state.goals.length===0 && state.logs.length===0){ seed(); save(true); render(); }
        toast("云端数据拉取失败，正在展示本地缓存，可稍后点「重新同步」");
      }
    });
  });
}
