
(function(){
"use strict";

/* ================= Database SDK 接入 ================= */
var DATABASE_ID = 'yOmp5ctpMiusQWfUsOzwc5';
var ONLINE = false, LOCAL_ONLY = false;
try { if (window.__SMART_PAGE__ && window.__SMART_PAGE__.database) { var db = window.__SMART_PAGE__.database; ONLINE = true; } } catch(e) {}

function pullRemote(cb){
  if (!ONLINE || LOCAL_ONLY) { if(cb) cb(false); return; }
  var all = [], cursor = null;
  function fetchPage(){
    db.query({ databaseId: DATABASE_ID, pageSize: 100, startCursor: cursor }).then(function(result){
      all = all.concat(result.results || []);
      if (result.hasMore && result.nextCursor) { cursor = result.nextCursor; fetchPage(); }
      else { mergeRemote(all); if(cb) cb(true); }
    }).catch(function(err){ if(cb) cb(false); });
  }
  fetchPage();
}

function mergeRemote(rows){
  if(!rows || !rows.length) return;
  var seen = {};
  state.logs.forEach(function(l){ seen[(l.date+"|"+l.goalId+"|"+l.amount)]=1; });
  var added = 0;
  rows.forEach(function(r){
    var gname = r["目标名"] || "";
    var g = null;
    for(var i=0;i<state.goals.length;i++){ if(state.goals[i].name===gname){ g=state.goals[i]; break; } }
    if(!g) return;
    var d = r["日期"] ? String(r["日期"]).slice(0,10) : todayStr();
    var amt = Number(r["打卡量"]) || 0;
    var key = d+"|"+g.id+"|"+amt;
    if(seen[key]) return;
    seen[key]=1;
    state.logs.push({ id:uid(), goalId:g.id, date:d, amount:amt, minutes:null, ts:Date.now() });
    added++;
  });
  if(added>0){ save(true); }
}

function pushRemote(rec, goal){
  if (!ONLINE || LOCAL_ONLY) return;
  try {
    var props = {};
    props["日期"] = { date: rec.date };
    props["目标名"] = { text: goal ? goal.name : "" };
    props["打卡量"] = { number: rec.amount };
    props["单位"] = { text: goal ? goal.unit : "" };
    props["备注"] = { text: rec.makeup ? "补记" : "" };
    db.addRecord({ databaseId: DATABASE_ID, properties: props }).catch(function(err){
      goLocalOnly("写入失败");
    });
  } catch(e){ goLocalOnly("写入异常"); }
}

function goLocalOnly(reason){
  LOCAL_ONLY = true;
  console.warn("[database] " + reason);
}

/* ================= 工具 ================= */
var LS_KEY = "goal_workspace_v1";
var LEGACY_KEYS = ["learning-goal-tracker-v1"];
var BROKEN_KEY = "goal_workspace_v1_broken";
var COLORS = ["#6366f1","#f59e0b","#10b981","#0ea5e9","#8b5cf6","#ef4444","#f97316","#14b8a6"];
/* 内置演示数据的目标 id（用于旧演示内容升级时清理；与用户自建目标区分） */
var SEED_IDS = ["seed-g1","seed-g2","seed-g3","seed-g4","seed-g5","seed-g6"];
var SEED_VERSION = 3;
var bootNotice = "";

function pad(n){ return (n<10?"0":"")+n; }
function fmtDate(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function parseDate(s){ var p=s.split("-"); return new Date(+p[0], +p[1]-1, +p[2]); }
function todayStr(){ return fmtDate(new Date()); }
function addDays(s,n){ var d=parseDate(s); d.setDate(d.getDate()+n); return fmtDate(d); }
function diffDays(a,b){ return Math.round((parseDate(b)-parseDate(a))/86400000); } /* b - a */
function fmtShort(s){ var p=s.split("-"); return (+p[1])+"/"+(+p[2]); }
function trimNum(n){
  if(Math.abs(n-Math.round(n))<1e-9) return String(Math.round(n));
  return (Math.round(n*10)/10).toString();
}
function uid(){ return "id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function mondayOf(dateStr){
  var d=parseDate(dateStr); var dow=(d.getDay()+6)%7; d.setDate(d.getDate()-dow); return fmtDate(d);
}

/* ================= 数据 ================= */
var state = null;

function blankState(){
  return { version:2, seedVersion:SEED_VERSION, goals:[], logs:[], notes:{}, seeded:false, backupDismissedAt:null, createdAt:todayStr() };
}

function isDateString(v){
  if(typeof v!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  var d=parseDate(v);
  return !isNaN(d.getTime()) && fmtDate(d)===v;
}
function finiteNumber(v,min,max){ return typeof v==="number" && Number.isFinite(v) && v>=min && v<=max; }
function cleanText(v,max){ return typeof v==="string" ? v.trim().slice(0,max) : ""; }

/* v1 → v2 迁移，并兼容早期字段名 */
function migrate(data){
  data=data||state;
  if(!Array.isArray(data.goals)) data.goals=[];
  if(!Array.isArray(data.logs)) data.logs=[];
  if(!data.notes || typeof data.notes!=="object" || Array.isArray(data.notes)) data.notes={};
  data.goals.forEach(function(g){
    if(typeof g.obstacle!=="string") g.obstacle="";
    if(typeof g.plan!=="string") g.plan="";
    if(g.sample===true && SEED_IDS.indexOf(g.id)<0) SEED_IDS.push(g.id);
  });
  data.logs.forEach(function(l){ if(!l.date && l.d) l.date=l.d; delete l.d; });
  var nn={};
  for(var k in data.notes){
    var v=data.notes[k];
    nn[k]=(typeof v==="string") ? {keep:v,problem:"",try:"",next:""} : v;
  }
  data.notes=nn;
  if(data.meta && typeof data.meta==="object"){
    if(data.seeded==null) data.seeded=!!data.meta.installedSample;
    if(data.backupDismissedAt==null && finiteNumber(data.meta.backupRemindedAt,0,1000000)) data.backupDismissedAt=data.meta.backupRemindedAt;
  }
  if(typeof data.seeded!=="boolean") data.seeded=false;
  if(typeof data.seedVersion!=="number") data.seedVersion=1;
  if(data.backupDismissedAt!=null && !finiteNumber(data.backupDismissedAt,0,1000000)) data.backupDismissedAt=null;
  if(!isDateString(data.createdAt)) data.createdAt=todayStr();
  data.version=2;
  delete data.exportedAt;
  return data;
}

function validateState(input){
  var data=migrate(input);
  if(data.goals.length>500 || data.logs.length>100000) throw new Error("数据条数超出支持范围");
  var goalIds={};
  data.goals.forEach(function(g){
    if(!g || typeof g!=="object") throw new Error("目标数据损坏");
    if(typeof g.id!=="string" || !/^[A-Za-z0-9_-]{1,80}$/.test(g.id) || goalIds[g.id]) throw new Error("目标 ID 无效或重复");
    goalIds[g.id]=1;
    g.name=cleanText(g.name,30); g.unit=cleanText(g.unit,6)||"个";
    g.obstacle=cleanText(g.obstacle,60); g.plan=cleanText(g.plan,60);
    if(!g.name || !finiteNumber(g.total,0.000000001,1000000000000)) throw new Error("目标名称或总量无效");
    if(!isDateString(g.deadline) || !isDateString(g.createdAt)) throw new Error("目标日期无效");
    if(typeof g.color==="string") g.color=g.color.toLowerCase();
    if(COLORS.indexOf(g.color)<0) throw new Error("目标配色无效");
  });
  var logIds={};
  data.logs.forEach(function(l){
    if(!l || typeof l!=="object") throw new Error("打卡记录损坏");
    if(typeof l.id!=="string" || !/^[A-Za-z0-9_-]{1,80}$/.test(l.id) || logIds[l.id]) throw new Error("记录 ID 无效或重复");
    logIds[l.id]=1;
    if(!goalIds[l.goalId] || !isDateString(l.date)) throw new Error("记录关联或日期无效");
    if(!finiteNumber(l.amount,0.000000001,1000000000000)) throw new Error("记录完成量无效");
    if(l.minutes!=null && !finiteNumber(l.minutes,0,1440)) throw new Error("记录用时无效");
    if(l.ts!=null && !finiteNumber(l.ts,0,9007199254740991)) l.ts=Date.now();
    l.makeup=!!l.makeup;
  });
  var cleanNotes={};
  Object.keys(data.notes).forEach(function(k){
    if(!isDateString(k)) return;
    var n=data.notes[k]||{};
    cleanNotes[k]={keep:cleanText(n.keep,100),problem:cleanText(n.problem,100),try:cleanText(n.try,100),next:cleanText(n.next,100)};
  });
  data.notes=cleanNotes;
  return data;
}

function save(silent){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    return true;
  }catch(e){
    if(!silent) toast("数据未能写入，请检查存储空间");
    return false;
  }
}

function load(){
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
}

function seed(){
  /* 内置演示内容：模拟已使用约一个半月的状态（目标 + 打卡记录 + 周报复盘）。
     首次打开自动载入；与用户自建数据无异，可任意编辑、删除。 */
  var t = todayStr(), now = Date.now(), L = [];
  function log(g,d,a,m,mk){
    var o={ id:uid(), goalId:g, date:addDays(t,d), amount:a, minutes:m||null, ts:now+d*86400000 };
    if(mk) o.makeup=true;
    L.push(o);
  }
  /* 若存在旧版演示目标，先移除（用户自建目标保留） */
  state.goals = state.goals.filter(function(g){ return SEED_IDS.indexOf(g.id)<0; });
  state.logs = state.logs.filter(function(l){ return SEED_IDS.indexOf(l.goalId)<0; });

  /* g1 背英语单词：近 25 天全勤 → 长 streak；节奏好 → 预计提前完成 */
  state.goals.push({ id:"seed-g1", name:"背英语单词", unit:"个", total:2500, deadline:addDays(t,50), color:COLORS[0], createdAt:addDays(t,-31), obstacle:"今天状态差，一个都不想背", plan:"先只背 10 个，打开就算赢" });
  for(var i=-31;i<=-1;i++){
    if(i>=-25 || Math.abs(i)%2===0){
      log("seed-g1", i, 45+Math.abs(i)*7%20, 30+Math.abs(i)*13%15, i===-2);
    }
  }
  /* g2 读完《人类简史》：均速偏低 → 预计拖后；本周两次漏打 → 休息日 + 红卡演示 */
  state.goals.push({ id:"seed-g2", name:"读完《人类简史》", unit:"页", total:440, deadline:addDays(t,20), color:COLORS[1], createdAt:addDays(t,-31), obstacle:"睡前一躺下就想刷手机", plan:"把书放在枕头上，先读 2 页再看手机" });
  for(i=-31;i<=-6;i++){
    var m2=Math.abs(i)%7;
    if(m2===0 || m2===3) log("seed-g2", i, 14+Math.abs(i)%9, 30+Math.abs(i)*7%20);
  }
  log("seed-g2",-5,20,35);   /* 周一 */
  /* 周二漏 → 本周休息日，连续天数保住 */
  log("seed-g2",-3,12,30);   /* 周三 */
  log("seed-g2",-2,15,32);   /* 周四 */
  /* 周五又漏 → 红卡，滚入今日处理 */

  /* g3 Python 入门课：节奏中等，最近一周全勤 */
  state.goals.push({ id:"seed-g3", name:"Python 入门课", unit:"节", total:40, deadline:addDays(t,14), color:COLORS[2], createdAt:addDays(t,-27), obstacle:"卡在一个知识点就想放弃", plan:"先跳过学后面的，周末回头补" });
  for(i=-27;i<=-8;i++){
    var m3=Math.abs(i)%7;
    if(m3===1 || m3===4 || m3===6) log("seed-g3", i, 1+(Math.abs(i)%4===0?1:0), 55+Math.abs(i)%20);
  }
  for(i=-7;i<=-1;i++) log("seed-g3", i, 1, 55+Math.abs(i)%25);

  /* g4 读完《刻意练习》：已于上周完成（截止日当天达成演示） */
  state.goals.push({ id:"seed-g4", name:"读完《刻意练习》", unit:"页", total:320, deadline:addDays(t,-6), color:COLORS[3], createdAt:addDays(t,-42) });
  var g4sum=0;
  for(i=-42;i<=-7;i++){
    var m4=Math.abs(i)%4;
    if(m4!==1){ g4sum+=9+Math.abs(i)*5%6; log("seed-g4", i, 9+Math.abs(i)*5%6, 25+Math.abs(i)%15); }
  }
  log("seed-g4",-6,Math.max(1,320-g4sum),30);

  /* g5 读完《置身事内》：新目标，节奏正常，昨天也保持了 */
  state.goals.push({ id:"seed-g5", name:"读完《置身事内》", unit:"章", total:11, deadline:addDays(t,30), color:COLORS[4], createdAt:addDays(t,-12), obstacle:"周末一出门就忘了带书", plan:"把书放背包里，出门就背着" });
  log("seed-g5",-10,1,60); log("seed-g5",-7,1,55); log("seed-g5",-4,1,65); log("seed-g5",-2,1,50); log("seed-g5",-1,1,45);

  /* g6 读完《被讨厌的勇气》：更早完成的目标（7/15 完成），与 g4 组成两个已完成目标 */
  state.goals.push({ id:"seed-g6", name:"读完《被讨厌的勇气》", unit:"页", total:190, deadline:addDays(t,-16), color:COLORS[5], createdAt:addDays(t,-38), obstacle:"到家就瘫在沙发上刷短视频", plan:"先把书放餐桌上，饭后读 10 页再休息" });
  var g6sum=0;
  for(i=-38;i<=-18;i++){
    var m6=Math.abs(i)%3;
    if(m6!==0){ g6sum+=9+Math.abs(i)%7; log("seed-g6", i, 9+Math.abs(i)%7, 25+Math.abs(i)%15); }
  }
  log("seed-g6",-17,Math.max(1,190-g6sum),35);

  state.logs = state.logs.concat(L);
  state.seeded = true;

  /* 最近两周的周报复盘（本周留空，等待用户填写） */
  state.notes[mondayOf(addDays(t,-7))] = { keep:"Python 一周坚持了 6 天", problem:"周末两天完全没碰书", try:"周末上午先完成一节再出门", next:"如果周末想赖床，就先把电脑放桌上" };
  state.notes[mondayOf(addDays(t,-14))] = { keep:"《刻意练习》按计划读完，最后一周每天补到 10 页", problem:"单词有两天差点断掉", try:"把单词固定到早饭后", next:"如果早上起晚了，就利用午休补 10 个" };
}

/* ================= 计算 ================= */
function goalById(id){ for(var i=0;i<state.goals.length;i++) if(state.goals[i].id===id) return state.goals[i]; return null; }
function doneAmount(gid){
  var s=0; for(var i=0;i<state.logs.length;i++) if(state.logs[i].goalId===gid) s+=state.logs[i].amount; return s;
}
function logsOn(gid,dateStr){
  var s=0; for(var i=0;i<state.logs.length;i++) if(state.logs[i].goalId===gid && state.logs[i].date===dateStr) s+=state.logs[i].amount; return s;
}
function minutesOn(gid,dateStr){
  var s=0; for(var i=0;i<state.logs.length;i++) if(state.logs[i].goalId===gid && state.logs[i].date===dateStr && state.logs[i].minutes) s+=state.logs[i].minutes; return s;
}
function hasLogOn(gid,dateStr){
  for(var i=0;i<state.logs.length;i++) if(state.logs[i].goalId===gid && state.logs[i].date===dateStr) return true; return false;
}
function dateSetOf(gid){
  var s={}; for(var i=0;i<state.logs.length;i++) if(state.logs[i].goalId===gid) s[state.logs[i].date]=1; return s;
}
/* 休息日判定：d 无记录，且 d 所在周周一（不早于创建日）至 d-1 无更早漏打日 → d 是本周首个漏打日，自动成为休息日 */
function isRestDay(gid, d, dates){
  var g=goalById(gid); if(!g) return false;
  var mon=mondayOf(d);
  var start = mon < g.createdAt ? g.createdAt : mon;
  var cur=start;
  while(cur<d){
    if(!dates[cur]) return false;
    cur=addDays(cur,1);
  }
  return true;
}
function streak(gid){
  var g=goalById(gid); if(!g) return 0;
  var dates=dateSetOf(gid);
  var d=todayStr();
  if(!dates[d]) d=addDays(d,-1);
  var s=0;
  while(d>=g.createdAt){
    if(dates[d]){ s++; d=addDays(d,-1); continue; }
    if(isRestDay(gid,d,dates)){ d=addDays(d,-1); continue; }
    break;
  }
  return s;
}
/* 近 7 天总投入（含今天，共 7 个自然日） */
function last7Sum(gid){
  var t=todayStr(), from=addDays(t,-6), s=0;
  for(var i=0;i<state.logs.length;i++){
    var l=state.logs[i];
    if(l.goalId===gid && l.date>=from && l.date<=t) s+=l.amount;
  }
  return s;
}
/* 预计完成日：null=样本不足 */
function eta(g){
  var done=doneAmount(g.id), remain=g.total-done;
  if(remain<=0) return { status:"done" };
  var speed=last7Sum(g.id)/7;
  if(speed<=0) return { status:"unknown" };
  var days=Math.ceil(remain/speed);
  var etaDate=addDays(todayStr(),days);
  var diff=diffDays(etaDate,g.deadline); /* 截止-预计：正则提前 */
  return { status:"ok", date:etaDate, diff:diff };
}
function dailySuggest(g){
  var remain=g.total-doneAmount(g.id);
  if(remain<=0) return 0;
  var daysLeft=diffDays(todayStr(),g.deadline);
  if(daysLeft<0) return remain; /* 已逾期：建议一次补完 */
  return Math.ceil(remain/Math.max(1,daysLeft+1)*10)/10;
}
function isComplete(g){ return doneAmount(g.id)>=g.total; }
function isOverdue(g){ return !isComplete(g) && diffDays(todayStr(),g.deadline)<0; }
function missedYesterday(g){
  if(isComplete(g) || hasLogOn(g.id,todayStr())) return false;
  if(g.createdAt>addDays(todayStr(),-1)) return false;
  return !hasLogOn(g.id, addDays(todayStr(),-1));
}

/* ================= 渲染：通用 ================= */
var $ = function(id){ return document.getElementById(id); };
var toastTimer=null;
function toast(msg){
  var el=$("toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.classList.remove("show"); },2200);
}
var ICON = {
  flame:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>',
  calendar:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  trend:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>',
  check:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'
};

function render(){
  renderHero();
  renderToday();
  renderBoard();
  renderWeekly();
}

/* ================= Hero ================= */
function renderHero(){
  var active=0, checkedToday=0;
  var t=todayStr();
  state.goals.forEach(function(g){
    if(!isComplete(g)){
      active++;
      if(hasLogOn(g.id,t)) checkedToday++;
    }
  });
  var checkinText=active>0 ? checkedToday+'/'+active : '全部已完成';
  $("heroChips").innerHTML =
    '<span class="chip">进行中 <b class="num">'+active+'</b> 个目标</span>'+
    '<span class="chip">进行中今日已打卡 <b class="num">'+checkinText+'</b></span>'+ 
    '<span class="chip">累计记录 <b class="num">'+state.logs.length+'</b> 条</span>';
}

/* ================= 今日打卡 ================= */
function planLineHtml(g){
  if(g.obstacle && g.plan){
    return '<div class="plan-line"><span class="tag-rest">预案</span><span>如果'+esc(g.obstacle)+'，我就'+esc(g.plan)+'</span></div>';
  }
  if(g.plan){
    return '<div class="plan-line"><span class="tag-rest">对策</span><span>'+esc(g.plan)+'</span></div>';
  }
  return '';
}
function renderToday(){
  var t=todayStr(), y=addDays(t,-1);
  var realMissed=[], restGoals=[];
  state.goals.forEach(function(g){
    if(!missedYesterday(g)) return;
    if(isRestDay(g.id, y, dateSetOf(g.id))) restGoals.push(g); else realMissed.push(g);
  });
  var pending=state.goals.filter(function(g){ return !isComplete(g) && !hasLogOn(g.id,t) && !missedYesterday(g); });
  var activeGoals=state.goals.filter(function(g){ return !isComplete(g); });

  var zh='';
  if(activeGoals.length===0 && state.goals.length>0){
    zh='<div class="all-done">🎉 所有目标都已达成。去「进度看板」回顾成果，或新建目标继续。</div>';
  }else if(realMissed.length===0 && restGoals.length===0 && pending.length===0){
    zh='<div class="all-done">今天全部目标都已打卡，保持住这个节奏。</div>';
  }else if(realMissed.length>0 || restGoals.length>0){
    zh+='<div class="card-title" style="margin:2px 0 10px"><span class="dot" style="background:var(--red)"></span>今天要处理</div>';
    realMissed.forEach(function(g){
      var od=isOverdue(g);
      zh+='<div class="missed-card">'+
        '<div class="icon">'+ICON.alert+'</div>'+
        '<div class="info"><b>'+esc(g.name)+'</b><div class="why">'+(od?'已逾期 '+(-diffDays(t,g.deadline))+' 天，且昨天没学':'昨天没学 · 已滚入今日')+'</div>'+planLineHtml(g)+'</div>'+
        '<div class="actions">'+
          '<button class="btn btn-red" data-checkin="'+g.id+'" style="min-height:44px">立即打卡</button>'+
          (od?'<button class="btn btn-ghost" data-edit="'+g.id+'" style="min-height:44px">调整计划</button>':'')+
        '</div>'+
      '</div>';
    });
    restGoals.forEach(function(g){
      zh+='<div class="rest-card">'+
        '<div class="icon">'+ICON.calendar+'</div>'+
        '<div class="info"><b>'+esc(g.name)+'</b><div class="why">昨天漏打卡 · 已用本周休息日（每周 1 天），连续天数保住了</div>'+planLineHtml(g)+'</div>'+
        '<button class="btn btn-amber" data-checkin="'+g.id+'" style="min-height:44px">立即打卡</button>'+
      '</div>';
    });
  }
  $("todayZone").innerHTML=zh;

  var pendHtml='', doneHtml='', doneCnt=0;
  if(state.goals.length===0){
    pendHtml='<div class="card empty" style="grid-column:1/-1">还没有目标，点下方「＋ 新建学习目标」开始。</div>';
  }else if(activeGoals.length===0){
    pendHtml='<div class="card empty" style="grid-column:1/-1">🎉 所有目标都已达成，今日无需打卡。去「进度看板」回顾成果吧。</div>';
  }else{
    activeGoals.forEach(function(g){
      var rowHtml=goalRowHtml(g);
      if(hasLogOn(g.id,t)){ doneHtml+=rowHtml; doneCnt++; }
      else pendHtml+=rowHtml;
    });
  }
  $("todayList").innerHTML=pendHtml;
  var ds=$("doneSection");
  if(doneCnt>0){
    ds.innerHTML='<div class="done-sec"><div class="done-sec-title">'+ICON.check+'今日已打卡<span class="cnt">'+doneCnt+'</span></div>'+
      '<div class="today-grid">'+doneHtml+'</div></div>';
  }else ds.innerHTML='';
  renderTodayStats();
  renderWeekRhythm();
}

/* 单个目标卡片（待打卡区与今日已完成区共用） */
function goalRowHtml(g){
  var t=todayStr();
  var html='';
  {
    var done=doneAmount(g.id), pct=Math.min(100, Math.round(done/g.total*100));
    var checked=hasLogOn(g.id,t), todayAmt=logsOn(g.id,t);
    var od=isOverdue(g), sug=dailySuggest(g);
    var st=streak(g.id);
    var cls="goal-row"+(checked?" done":"")+(od?" overdue":"");
    html+='<div class="'+cls+'" id="row-'+g.id+'">'+
      '<div class="goal-head">'+
        '<span class="goal-color-dot" style="background:'+g.color+'"></span>'+
        '<span class="goal-name">'+esc(g.name)+'</span>'+
        (isComplete(g)?'<span class="badge badge-done">已完成</span>':
          od?'<span class="badge badge-overdue">已逾期</span>':
          checked?'<span class="badge badge-today">今日已打卡</span>':'')+
        '<button class="icon-btn" data-edit="'+g.id+'" aria-label="编辑目标 '+esc(g.name)+'" style="margin-left:auto">'+
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>'+
        '<button class="icon-btn danger" data-del="'+g.id+'" aria-label="删除目标 '+esc(g.name)+'">'+
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'+
      '</div>'+
      '<div class="mini-progress"><i style="width:'+pct+'%;background:'+g.color+'"></i></div>'+
      '<div class="muted" style="margin-bottom:10px">'+
        '<b class="num">'+trimNum(done)+'</b> / '+trimNum(g.total)+' '+esc(g.unit)+
        ' · 截止 '+fmtShort(g.deadline)+
        (st>0?' · <span class="streak-flame">'+ICON.flame+'<span class="num">'+st+'</span> 天</span>':'')+
        (!isComplete(g)&&!od?' · 今日建议 <b class="num">+'+trimNum(sug)+'</b> '+esc(g.unit):'')+
      '</div>';
    if(isComplete(g)){
      html+='<div class="today-note">'+ICON.check+'目标已达成，共投入 '+trimNum(done)+' '+esc(g.unit)+'。</div>';
    }else{
      var dateOpts='';
      for(var di=0;di<=6;di++){
        var dv=addDays(t,-di);
        dateOpts+='<option value="'+dv+'"'+(di===0?' selected':'')+'>'+(di===0?'今天':di===1?'昨天 '+fmtShort(dv):fmtShort(dv))+'</option>';
      }
      html+='<div class="checkin">'+
        '<div class="field"><label for="amt-'+g.id+'">本次完成（'+esc(g.unit)+'）</label><input type="number" step="any" min="0" max="1000000000000" inputmode="decimal" id="amt-'+g.id+'" value="'+trimNum(sug)+'"></div>'+
        '<div class="field"><label for="min-'+g.id+'">用时（分钟，可选）</label><input type="number" step="1" min="0" max="1440" inputmode="numeric" id="min-'+g.id+'" placeholder="30"></div>'+
        '<div class="field"><label for="date-'+g.id+'">日期</label><select id="date-'+g.id+'">'+dateOpts+'</select></div>'+ 
        '<button class="btn '+(checked?'btn-green':'btn-brand')+'" data-checkin="'+g.id+'">'+(checked?'再记一笔':'打卡')+'</button>'+
      '</div>';
      if(checked) html+='<div class="today-note">'+ICON.check+'今天已 +'+trimNum(todayAmt)+' '+esc(g.unit)+'，可以继续追加。</div>';
    }
    html+='</div>';
  }
  return html;
}

/* ---- 今日概览统计条 / 本周节奏 ---- */
var STAT_ICONS = {
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
  flag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4c4-2 8 2 12 0v10c-4 2-8-2-12 0"/></svg>'
};
function statCard(icon,color,bg,num,lbl){
  return '<div class="stat-card"><span class="stat-ico" style="color:'+color+';background:'+bg+'">'+icon+'</span>'+
    '<span class="stat-text"><span class="stat-num num">'+num+'</span><span class="stat-lbl">'+lbl+'</span></span></div>';
}
function minutesTotalOn(dateStr){
  var s=0;
  state.logs.forEach(function(l){ if(l.date===dateStr) s+=(l.minutes||0); });
  return s;
}
function renderTodayStats(){
  var box=$("todayStats");
  var active=state.goals.filter(function(g){ return !isComplete(g); });
  if(active.length===0){ box.innerHTML=''; box.style.display='none'; return; }
  box.style.display='';
  var t=todayStr();
  var doneCnt=active.filter(function(g){ return hasLogOn(g.id,t); }).length;
  var best=0;
  active.forEach(function(g){ best=Math.max(best,streak(g.id)); });
  box.innerHTML =
    statCard(STAT_ICONS.check,'#6366f1','#eef0ff', doneCnt+'/'+active.length, '今日已打卡')+
    statCard(STAT_ICONS.clock,'#d97706','#fef3e2', minutesTotalOn(t), '今日投入（分钟）')+
    statCard(STAT_ICONS.target,'#059669','#e8f6f0', active.length, '进行中目标')+
    statCard(ICON.flame,'#ea580c','#fdeee2', best+' 天', '最长连续');
}
function renderWeekRhythm(){
  var box=$("weekRhythm");
  var active=state.goals.filter(function(g){ return !isComplete(g); });
  if(active.length===0){ box.innerHTML=''; return; }
  var t=todayStr(), mon=mondayOf(t);
  var CN=["一","二","三","四","五","六","日"];
  var cells='', total=0;
  for(var i=0;i<7;i++){
    var d=addDays(mon,i), m=minutesTotalOn(d);
    total+=m;
    var future=d>t;
    var cls='rhythm-day'+(m>0?' hit':'')+(d===t?' today':'')+(future?' future':'');
    cells+='<div class="'+cls+'"><div class="dl">'+CN[i]+'</div><div class="dd">'+(m>0?'✓':(future?'':'·'))+'</div><div class="dm">'+(m>0?m+'分':'')+'</div></div>';
  }
  box.innerHTML='<div class="card" style="margin-top:14px">'+
    '<div class="card-title">'+ICON.calendar+'本周打卡节奏'+
      '<span style="margin-left:auto;font-size:12px;color:var(--ink-3);font-weight:400">本周已投入 <b class="num">'+total+'</b> 分钟</span></div>'+
    '<div class="rhythm">'+cells+'</div></div>';
}

/* ================= 进度看板 ================= */
function renderBoard(){
  var html='';
  if(state.goals.length===0) html='<div class="card empty" style="grid-column:1/-1">暂无目标。</div>';
  /* 分区：进行中在前，已完成目标归入「已完成」区（历史达成有明确去处） */
  var active=[], done=[];
  state.goals.forEach(function(g){ if(isComplete(g)) done.push(g); else active.push(g); });
  active.forEach(function(g){ html+=boardCardHtml(g); });
  if(done.length>0){
    html+='<div class="board-sec-title">'+
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'+
      '已完成<span class="cnt">'+done.length+'</span></div>';
    done.forEach(function(g){ html+=boardCardHtml(g); });
  }
  $("boardGrid").innerHTML=html;
  renderChart();
  renderBoardStats();
  renderBoardBottom();
}

function boardCardHtml(g){
  var done=doneAmount(g.id), pct=Math.min(100, done/g.total*100);
  var st=streak(g.id), e=eta(g);
  var C=2*Math.PI*40, off=C*(1-pct/100);
  var etaHtml='';
  if(e.status==="done") etaHtml='<span class="eta-ahead">已达成</span>';
  else if(e.status==="unknown") etaHtml='<span style="color:var(--ink-3)">近 7 天无记录，暂无推算</span>';
  else{
    var cmp = e.diff>=0 ? '<span class="eta-ahead">提前 '+e.diff+' 天</span>' : '<span class="eta-behind">拖后 '+(-e.diff)+' 天</span>';
    etaHtml=fmtShort(e.date)+' · '+cmp;
  }
  return '<div class="goal-card">'+
    '<div class="goal-head" style="margin-bottom:12px">'+
      '<span class="goal-color-dot" style="background:'+g.color+'"></span>'+
      '<span class="goal-name">'+esc(g.name)+'</span>'+
    '</div>'+
    '<div class="ring-wrap">'+
      '<div class="ring">'+
        '<svg width="96" height="96" viewBox="0 0 96 96">'+
          '<circle cx="48" cy="48" r="40" fill="none" stroke="#eef0f6" stroke-width="10"/>'+
          '<circle cx="48" cy="48" r="40" fill="none" stroke="'+g.color+'" stroke-width="10" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" style="transition:stroke-dashoffset .6s ease"/>'+
        '</svg>'+
        '<div class="pct"><b class="num">'+Math.round(pct)+'%</b><span>完成率</span></div>'+
      '</div>'+
      '<div class="ring-stats">'+
        '<div class="stat-line">'+ICON.trend+'<b class="num">'+trimNum(done)+'</b>&nbsp;/ '+trimNum(g.total)+' '+esc(g.unit)+'</div>'+
        '<div class="stat-line">'+ICON.flame.replace('currentColor','#f97316')+'连续 <b class="num">&nbsp;'+st+'&nbsp;</b> 天</div>'+
        '<div class="stat-line">'+ICON.calendar+'预计 <b>&nbsp;'+etaHtml+'</b></div>'+
      '</div>'+
    '</div>'+
    (g.plan?'<div class="plan-line-board"><b>预案</b> '+(g.obstacle?'如果'+esc(g.obstacle)+'，我就':'')+esc(g.plan)+'</div>':'')+
    renderRecentLogs(g)+
  '</div>';
}

/* ---- 看板统计条 / 打卡热力 / 最近动态 ---- */
function renderBoardStats(){
  var box=$("boardStats");
  if(state.goals.length===0){ box.innerHTML=''; box.style.display='none'; return; }
  box.style.display='';
  var active=0, fin=0;
  state.goals.forEach(function(g){ if(isComplete(g)) fin++; else active++; });
  var tmin=0;
  state.logs.forEach(function(l){ tmin+=(l.minutes||0); });
  var tminTxt = tmin>=60 ? trimNum(Math.round(tmin/60*10)/10)+' 小时' : tmin+' 分钟';
  box.innerHTML =
    statCard(STAT_ICONS.target,'#6366f1','#eef0ff', active, '进行中目标')+
    statCard(STAT_ICONS.flag,'#059669','#e8f6f0', fin, '已完成目标')+
    statCard(STAT_ICONS.check,'#d97706','#fef3e2', state.logs.length, '累计打卡（次）')+
    statCard(STAT_ICONS.clock,'#7c3aed','#f1eafe', tminTxt, '累计投入');
}
function renderBoardBottom(){
  var box=$("boardBottom");
  if(state.logs.length===0){ box.innerHTML=''; return; }
  var t=todayStr(), start=addDays(t,-34);
  var offset=diffDays(mondayOf(start), start); /* 0..6，补空格对齐周一 */
  var cells='';
  for(var i=0;i<offset;i++) cells+='<span></span>';
  for(var j=0;j<35;j++){
    var d=addDays(start,j), m=minutesTotalOn(d);
    var lv = m<=0?0 : m<30?1 : m<60?2 : m<90?3 : 4;
    cells+='<span class="heat-cell'+(lv>0?' l'+lv:'')+(d===t?' today':'')+'" title="'+d+' · '+(m>0?m+' 分钟':'未打卡')+'"></span>';
  }
  var heat='<div class="card">'+
    '<div class="card-title">'+ICON.calendar+'近 35 天打卡热力'+
      '<span style="margin-left:auto;font-size:12px;color:var(--ink-3);font-weight:400">颜色越深投入越多</span></div>'+
    '<div class="heat-days"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>'+
    '<div class="heat-grid">'+cells+'</div>'+
    '<div class="heat-legend">少<span class="heat-cell"></span><span class="heat-cell l1"></span><span class="heat-cell l2"></span><span class="heat-cell l3"></span><span class="heat-cell l4"></span>多</div>'+
  '</div>';
  var logs=state.logs.slice().sort(function(a,b){ return a.date<b.date?1:(a.date>b.date?-1:0); }).slice(0,8);
  var rows='';
  logs.forEach(function(l){
    var g=goalById(l.goalId);
    if(!g) return;
    var dl = l.date===t ? '今天' : (l.date===addDays(t,-1) ? '昨天' : fmtShort(l.date));
    rows+='<div class="feed-row"><span class="feed-dot" style="background:'+g.color+'"></span>'+
      '<div class="feed-main"><b>'+esc(g.name)+'</b> +'+trimNum(l.amount)+' '+esc(g.unit)+(l.minutes?' · '+l.minutes+' 分钟':'')+(l.makeup?' <span class="badge-makeup">补</span>':'')+'</div>'+
      '<span class="feed-date">'+dl+'</span></div>';
  });
  var feed='<div class="card">'+
    '<div class="card-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>最近动态</div>'+
    (rows || '<div class="tiny" style="color:var(--ink-3)">暂无记录</div>')+
  '</div>';
  box.innerHTML=heat+feed;
}

var logsExpanded={};
function renderRecentLogs(g){
  var arr=state.logs.filter(function(l){return l.goalId===g.id;}).sort(function(a,b){return a.date<b.date?1:-1;});
  if(arr.length===0) return '';
  var open=!!logsExpanded[g.id];
  var html='<button class="toggle-logs" data-togglelogs="'+g.id+'">'+(open?'收起记录 ▴':'查看 '+arr.length+' 条记录 ▾')+'</button>';
  if(open){
    html+='<div class="recent-logs">';
    arr.slice(0,10).forEach(function(l){
      html+='<div class="log-item"><span class="num">'+fmtShort(l.date)+'</span><b class="num">+'+trimNum(l.amount)+'</b> '+esc(g.unit)+(l.minutes?' · '+l.minutes+' 分钟':'')+(l.makeup?'<span class="badge-makeup">补</span>':'')+
        '<button class="del" data-dellog="'+l.id+'" title="删除这条记录">✕</button></div>';
    });
    if(arr.length>10) html+='<div class="tiny">仅显示最近 10 条</div>';
    html+='</div>';
  }
  return html;
}

/* ================= 14 天投入时长图：统一使用分钟，避免跨单位相加 ================= */
function renderChart(){
  var days=[], i, t=todayStr();
  for(i=13;i>=0;i--) days.push(addDays(t,-i));
  var data={}, max=0, usedGoals={};
  days.forEach(function(d){
    data[d]={}; var sum=0;
    state.goals.forEach(function(g){
      var v=minutesOn(g.id,d);
      if(v>0){ data[d][g.id]=v; sum+=v; usedGoals[g.id]=1; }
    });
    if(sum>max) max=sum;
  });
  if(max===0){ $("chartBox").innerHTML='<div class="empty">近 14 天暂无用时记录；打卡时填写分钟数后会显示趋势</div>'; $("chartLegend").innerHTML=''; return; }

  var W=680,H=210,padL=42,padB=26,padT=10,plotW=W-padL-8,plotH=H-padT-padB;
  var bw=Math.min(26, plotW/14*0.55), gap=plotW/14;
  var step=Math.max(1,max/4), mag=Math.pow(10,Math.floor(Math.log10(step)));
  var yMax=Math.ceil(max/4/mag)*mag*4; if(yMax<=0)yMax=max;

  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;min-width:520px;display:block" role="img" aria-label="近 14 天各目标投入分钟数堆叠图">';
  for(i=0;i<=4;i++){
    var v=yMax*i/4, y=padT+plotH-(v/yMax)*plotH;
    svg+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-8)+'" y2="'+y+'" stroke="#eef0f6" stroke-width="1"/>'+
         '<text x="'+(padL-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="#6b7280">'+trimNum(v)+'分</text>';
  }
  days.forEach(function(d,idx){
    var x=padL+gap*idx+(gap-bw)/2, cursor=padT+plotH;
    state.goals.forEach(function(g){
      var v=data[d][g.id]; if(!v)return;
      var h=(v/yMax)*plotH; cursor-=h;
      svg+='<rect x="'+x.toFixed(1)+'" y="'+cursor.toFixed(1)+'" width="'+bw+'" height="'+h.toFixed(1)+'" fill="'+g.color+'" rx="2"><title>'+esc(g.name)+' '+fmtShort(d)+' · '+trimNum(v)+' 分钟</title></rect>';
    });
    if(idx%2===0||idx===13) svg+='<text x="'+(x+bw/2).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" fill="#6b7280">'+fmtShort(d)+'</text>';
  });
  svg+='</svg>';
  $("chartBox").innerHTML=svg;
  var lg='';
  state.goals.forEach(function(g){ if(usedGoals[g.id]) lg+='<span><i style="background:'+g.color+'"></i>'+esc(g.name)+'</span>'; });
  $("chartLegend").innerHTML=lg;
}

/* ================= 目标管理 ================= */
/* ================= 我的 ================= */
/* ---------- 目标弹窗 ---------- */
var editingGoalId=null, pickedColor=COLORS[0], modalReturnFocus=null;
function openGoalModal(g){
  modalReturnFocus=document.activeElement;
  editingGoalId = g?g.id:null;
  $("modalTitle").textContent = g?"编辑目标":"新建学习目标";
  $("fName").value=g?g.name:"";
  $("fUnit").value=g?g.unit:"";
  $("fTotal").value=g?g.total:"";
  $("fDeadline").value=g?g.deadline:addDays(todayStr(),30);
  $("fObstacle").value=g?(g.obstacle||""):"";
  $("fPlan").value=g?(g.plan||""):"";
  pickedColor=g?g.color:COLORS[state.goals.length%COLORS.length];
  var cp='';
  COLORS.forEach(function(c){
    cp+='<button type="button" data-color="'+c+'" style="background:'+c+'" class="'+(c===pickedColor?'sel':'')+'" aria-label="选择配色 '+c+'" aria-pressed="'+(c===pickedColor?'true':'false')+'"></button>';
  });
  $("colorPick").innerHTML=cp;
  $("goalModal").classList.add("show");
  $("goalModal").setAttribute("aria-hidden","false");
  setTimeout(function(){ $("fName").focus(); },0);
}
function closeGoalModal(){
  $("goalModal").classList.remove("show");
  $("goalModal").setAttribute("aria-hidden","true");
  if(modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus=null;
}

/* ================= 周报复盘 ================= */
var weekOffset=0; /* 0=本周 */
function currentWeekRange(){
  var mon=mondayOf(todayStr());
  var start=addDays(mon, weekOffset*7);
  return { start:start, end:addDays(start,6) };
}
/* 统计一段日期范围：perGoal {gid:{sum,days,mins}} 与合计分钟 */
function weekStats(start,end){
  var per={}, totalMin=0;
  state.goals.forEach(function(g){
    var sum=0, days={}, mins=0;
    state.logs.forEach(function(l){
      if(l.goalId===g.id && l.date>=start && l.date<=end){
        sum+=l.amount; days[l.date]=1; if(l.minutes) mins+=l.minutes;
      }
    });
    per[g.id]={ sum:sum, days:Object.keys(days).length, mins:mins };
    totalMin+=mins;
  });
  return { per:per, totalMin:totalMin };
}
function readNoteForm(){
  return {
    keep:$("noteKeep").value.trim(),
    problem:$("noteProblem").value.trim(),
    try:$("noteTry").value.trim(),
    next:$("noteNext").value.trim()
  };
}
function renderWeekly(){
  var r=currentWeekRange();
  var isCur=weekOffset===0;
  $("weekLabel").textContent=fmtShort(r.start)+" - "+fmtShort(r.end)+(isCur?"（本周）":"");
  $("weekNext").style.visibility = weekOffset<0 ? "visible":"hidden";

  var cur=weekStats(r.start,r.end);
  var prev=weekStats(addDays(r.start,-7), addDays(r.start,-1));
  var html='', any=false;
  state.goals.forEach(function(g){
    var c=cur.per[g.id], p=prev.per[g.id];
    if(c.sum>0||c.days>0) any=true;
    /* 已完成且本周无投入的目标不占行，避免周报随历史完成数累积 */
    if(isComplete(g) && c.days===0) return;
    var cmp='';
    if(p.sum>0||p.days>0){
      cmp='<div class="week-compare">上周 '+(p.sum>0?'+'+trimNum(p.sum)+' '+esc(g.unit)+' · ':'')+'打卡 '+p.days+' 天'+(p.mins>0?' · '+p.mins+' 分钟':'')+'</div>';
    }
    html+='<div class="week-summary-row">'+
      '<span><span class="goal-color-dot" style="background:'+g.color+';display:inline-block;margin-right:6px;vertical-align:-1px"></span>'+esc(g.name)+'</span>'+
      '<span class="vals">'+(c.sum>0?'<b class="num">+'+trimNum(c.sum)+'</b> '+esc(g.unit)+' · ':'')+'打卡 <b class="num">'+c.days+'</b> 天'+(c.mins>0?' · <span class="num">'+c.mins+'</span> 分钟':'')+cmp+'</span>'+
    '</div>';
  });
  if(!any) html='<div class="empty" style="padding:20px">这一周还没有打卡记录</div>';
  else{
    var minCmp='';
    if(prev.totalMin>0){
      var dm=cur.totalMin-prev.totalMin;
      minCmp='<div class="week-compare">上周 '+prev.totalMin+' 分钟'+(dm!==0?'（较上周 '+(dm>0?'+':'')+dm+'）':'')+'</div>';
    }
    html+='<div class="week-summary-row" style="border-top:1px solid var(--line);margin-top:4px"><b>合计投入</b><span class="vals"><b class="num">'+cur.totalMin+'</b> 分钟'+minCmp+'</span></div>';
  }
  $("weekSummary").innerHTML=html;

  var wk=r.start, n=state.notes[wk]||{};
  $("noteKeep").value=n.keep||"";
  $("noteProblem").value=n.problem||"";
  $("noteTry").value=n.try||"";
  $("noteNext").value=n.next||"";
  $("reportBox").style.display="none";
}

function buildReportText(){
  var r=currentWeekRange();
  var cur=weekStats(r.start,r.end);
  var prev=weekStats(addDays(r.start,-7), addDays(r.start,-1));
  var lines=["【学习周报】"+fmtShort(r.start)+" - "+fmtShort(r.end)];
  state.goals.forEach(function(g){
    var c=cur.per[g.id], p=prev.per[g.id];
    if(c.sum>0||c.days>0){
      var pct=Math.min(100,Math.round(doneAmount(g.id)/g.total*100));
      var line="- "+g.name+"：+"+trimNum(c.sum)+" "+g.unit+"，打卡 "+c.days+" 天（累计 "+pct+"%）";
      if(p.sum>0) line+="｜上周 +"+trimNum(p.sum)+" "+g.unit;
      lines.push(line);
    }
  });
  if(cur.totalMin>0){
    var mline="本周总投入："+cur.totalMin+" 分钟";
    if(prev.totalMin>0) mline+="（上周 "+prev.totalMin+" 分钟）";
    lines.push(mline);
  }
  var n=state.notes[r.start]||{};
  if(n.keep) lines.push("保持："+n.keep);
  if(n.problem) lines.push("问题："+n.problem);
  if(n.try) lines.push("尝试："+n.try);
  if(n.next) lines.push("下周预案："+n.next);
  return lines.join("\n");
}

function copyText(text, okMsg){
  function fallback(){
    var ta=document.createElement("textarea");
    ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); toast(okMsg); }catch(e){ toast("复制失败，请手动选择复制"); }
    document.body.removeChild(ta);
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ toast(okMsg); }, fallback);
  }else fallback();
}

/* ================= 打卡 & 庆祝 ================= */
function doCheckin(gid){
  var g=goalById(gid); if(!g) return;
  var amtEl=$("amt-"+gid), minEl=$("min-"+gid), dateEl=$("date-"+gid);
  var amt=Number(amtEl.value);
  if(!finiteNumber(amt,0.000000001,1000000000000)){ toast("完成数量需为有效正数"); amtEl.focus(); return; }
  var mins=minEl&&minEl.value!==""?Number(minEl.value):null;
  if(mins!=null && !finiteNumber(mins,0,1440)){ toast("用时需为 0–1440 分钟"); minEl.focus(); return; }
  var date=(dateEl&&dateEl.value)?dateEl.value:todayStr();
  if(date<addDays(todayStr(),-6) || date>todayStr()) date=todayStr();
  var makeup = date<todayStr();
  var wasComplete=isComplete(g);
  var rec={ id:uid(), goalId:gid, date:date, amount:amt, minutes:mins, ts:Date.now() };
  if(makeup) rec.makeup=true;
  state.logs.push(rec);
  pushRemote(rec, g);
  save(); render();
  if(!wasComplete && isComplete(g)){
    celebrate();
    toast("目标「"+g.name+"」达成，恭喜！");
  }else if(makeup){
    toast("已补记 "+fmtShort(date)+"：+"+trimNum(amt)+" "+g.unit);
  }else{
    toast("已打卡 +"+trimNum(amt)+" "+g.unit);
  }
}

function celebrate(){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var colors=COLORS.concat(["#fbbf24","#34d399"]);
  for(var i=0;i<70;i++){
    var b=document.createElement("div");
    b.className="confetti-bit";
    var size=6+Math.random()*8;
    b.style.left=(Math.random()*100)+"vw";
    b.style.width=size+"px"; b.style.height=(size*0.5)+"px";
    b.style.background=colors[i%colors.length];
    b.style.animationDuration=(1.4+Math.random()*1.4)+"s";
    b.style.animationDelay=(Math.random()*0.4)+"s";
    document.body.appendChild(b);
    (function(el){ setTimeout(function(){ el.remove(); },3200); })(b);
  }
}

/* ================= 清空 ================= */
/* 两步确认按钮（防误触） */
function armConfirm(btn, label, action){
  if(btn.dataset.armed==="1"){ btn.dataset.armed=""; action(); return; }
  btn.dataset.armed="1";
  var old=btn.innerHTML;
  btn.innerHTML=label;
  btn.classList.add("confirming");
  if(btn.classList.contains("btn")) btn.style.background="var(--red)", btn.style.color="#fff";
  setTimeout(function(){ if(btn.dataset.armed){ btn.dataset.armed=""; btn.innerHTML=old; btn.classList.remove("confirming"); btn.style.background=""; btn.style.color=""; } },3000);
}

/* ================= 事件 ================= */
function switchTab(name,focusTab){
  document.querySelectorAll(".nav button").forEach(function(x){
    var on=x.dataset.tab===name;
    x.classList.toggle("active",on);
    x.setAttribute("aria-selected",on?"true":"false");
    x.tabIndex=on?0:-1;
    if(on && focusTab) x.focus();
  });
  document.querySelectorAll(".tab-panel").forEach(function(p){
    var on=p.id==="panel-"+name;
    p.classList.toggle("active",on);
    p.setAttribute("aria-hidden",on?"false":"true");
  });
}
function bind(){
  /* Tab 切换 */
  var tabs=Array.prototype.slice.call(document.querySelectorAll(".nav button"));
  tabs.forEach(function(b,idx){
    b.addEventListener("click",function(){ switchTab(b.dataset.tab); });
    b.addEventListener("keydown",function(e){
      if(e.key!=="ArrowRight" && e.key!=="ArrowLeft" && e.key!=="Home" && e.key!=="End") return;
      e.preventDefault();
      var next=e.key==="Home"?0:e.key==="End"?tabs.length-1:(idx+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
      switchTab(tabs[next].dataset.tab,true);
    });
  });

  /* 侧边栏新建目标（PC） */
  var sideAddBtn=$("btnSideAdd");
  if(sideAddBtn) sideAddBtn.addEventListener("click",function(){ openGoalModal(null); });

  /* 主区域事件代理 */
  document.querySelector("main").addEventListener("click",function(e){
    var t=e.target.closest("[data-checkin]");
    if(t){ doCheckin(t.dataset.checkin); return; }
    t=e.target.closest("[data-addgoal]");
    if(t){ openGoalModal(null); return; }
    t=e.target.closest("[data-goto]");
    if(t){ switchTab(t.dataset.goto); return; }
    t=e.target.closest("[data-togglelogs]");
    if(t){ var g=t.dataset.togglelogs; logsExpanded[g]=!logsExpanded[g]; renderBoard(); return; }
    t=e.target.closest("[data-dellog]");
    if(t){
      var id=t.dataset.dellog;
      armConfirm(t,"确认？",function(){
        state.logs=state.logs.filter(function(l){return l.id!==id;});
        save(); render(); toast("已删除该条记录");
      });
      return;
    }
    t=e.target.closest("[data-edit]");
    if(t){ openGoalModal(goalById(t.dataset.edit)); return; }
    t=e.target.closest("[data-del]");
    if(t){
      var gid=t.dataset.del;
      armConfirm(t,"确认删除？",function(){
        var g=goalById(gid);
        state.goals=state.goals.filter(function(x){return x.id!==gid;});
        state.logs=state.logs.filter(function(l){return l.goalId!==gid;});
        save(); render(); toast("已删除「"+(g?g.name:"")+"」及其全部记录");
      });
      return;
    }
    /* 我的：清空全部 */
    t=e.target.closest("#btnClearAll");
    if(t){
      var v=prompt("将删除全部目标与打卡记录，且不可恢复。\n请输入「清空」二字确认：");
      if(v==="清空"){ state=blankState(); save(); render(); toast("已清空全部数据"); }
      else if(v!==null) toast("未输入「清空」，已取消");
      return;
    }
  });

  /* 回车快捷打卡 */
  document.querySelector("main").addEventListener("keydown",function(e){
    if(e.key==="Enter" && e.target.id && e.target.id.indexOf("amt-")===0){
      doCheckin(e.target.id.slice(4));
    }
  });

  /* 新建目标弹窗 */
  $("modalCancel").addEventListener("click",closeGoalModal);
  $("goalModal").addEventListener("click",function(e){ if(e.target===$("goalModal")) closeGoalModal(); });
  $("goalModal").addEventListener("keydown",function(e){
    if(e.key==="Escape"){ e.preventDefault(); closeGoalModal(); return; }
    if(e.key!=="Tab") return;
    var items=Array.prototype.slice.call($("goalModal").querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(x){return x.offsetParent!==null;});
    if(!items.length) return;
    var first=items[0],last=items[items.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  });
  $("colorPick").addEventListener("click",function(e){
    var b=e.target.closest("[data-color]"); if(!b)return;
    pickedColor=b.dataset.color;
    $("colorPick").querySelectorAll("button").forEach(function(x){x.classList.remove("sel");x.setAttribute("aria-pressed","false");});
    b.classList.add("sel"); b.setAttribute("aria-pressed","true");
  });
  $("modalSave").addEventListener("click",function(){
    var name=$("fName").value.trim(), unit=$("fUnit").value.trim()||"个";
    var total=Number($("fTotal").value), dl=$("fDeadline").value;
    if(!name){ toast("请填写目标名称"); $("fName").focus(); return; }
    if(!finiteNumber(total,0.000000001,1000000000000)){ toast("总量需为有效正数"); $("fTotal").focus(); return; }
    if(!isDateString(dl)){ toast("请选择有效截止日"); $("fDeadline").focus(); return; }
    if(!editingGoalId && dl<todayStr()){ toast("截止日不能早于今天"); return; }
    if(editingGoalId){
      var g=goalById(editingGoalId);
      g.name=name; g.unit=unit; g.total=total; g.deadline=dl; g.color=pickedColor;
      g.obstacle=$("fObstacle").value.trim(); g.plan=$("fPlan").value.trim();
      toast("目标已更新");
    }else{
      state.goals.push({ id:uid(), name:name, unit:unit, total:total, deadline:dl, color:pickedColor, createdAt:todayStr(), obstacle:$("fObstacle").value.trim(), plan:$("fPlan").value.trim() });
      toast("已创建目标「"+name+"」");
    }
    save(); closeGoalModal(); render();
  });

  /* 周报 */
  $("weekPrev").addEventListener("click",function(){ weekOffset--; renderWeekly(); });
  $("weekNext").addEventListener("click",function(){ if(weekOffset<0){ weekOffset++; renderWeekly(); } });
  $("btnSaveNote").addEventListener("click",function(){
    var r=currentWeekRange();
    state.notes[r.start]=readNoteForm();
    save(); toast("复盘已保存到本周");
  });
  $("btnGenReport").addEventListener("click",function(){
    var r=currentWeekRange();
    state.notes[r.start]=readNoteForm(); save();
    $("reportPreview").textContent=buildReportText();
    $("reportBox").style.display="block";
  });
  $("btnCopyReport").addEventListener("click",function(){
    copyText($("reportPreview").textContent,"周报已复制，去粘贴分享吧");
  });
}

/* ================= 启动 ================= */
load();
bind();
render();
pullRemote(function(ok){ if(ok){ render(); } });
if(bootNotice) setTimeout(function(){ toast(bootNotice); },100);
})();
