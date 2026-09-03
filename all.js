 below. 
<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js">


const SUPABASE_URL = "https://vzetpnizonsiefwxnpmr.supabase.co";

const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZXRwbml6b25zaWVmd3hucG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NzQ5MzQsImV4cCI6MjEwMDA1MDkzNH0.Evn7aY3ZORN9MFcDr2jrDAJLkeATMKApEI_1NFbjBzE";
const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

// ── SUPABASE AUTH — real authentication authority ──────────────────────────────────────
// Login/signup/password-change/password-reset all go through sb.auth (signInWithPassword /
// signUp / updateUser / resetPasswordForEmail) instead of comparing public.users.password_hash
// client-side. password_hash may still exist as a legacy column but is never read or written
// by this file as of this migration. See FINAL WEBAPP AUDIT REPORT for details.

// Username -> auth email, via the secure RPC (does not expose other users' emails/rows).
// Supabase RPC calls fail on a parameter-name mismatch, not just a missing function, so this
// tries the two conventional spellings before giving up. Once the real signature is confirmed
// (see SCHEMA_VERIFICATION section of the release notes), the losing branch can be deleted.
async function resolveEmailForUsername(username){
  const attempts=[{p_username:username},{username:username}];
  let lastError=null;
  for(const args of attempts){
    const{data,error}=await sb.rpc('get_auth_email_by_username',args);
    if(!error) return {email:data||null,error:null};
    lastError=error;
    if(!/could not find|does not exist|schema cache|parameter/i.test(error.message||'')) break;
  }
  return {email:null,error:lastError};
}

// Fires when a Supabase password-recovery link (clicked from the reset email) lands back on
// this page. supabase-js auto-parses the recovery token from the URL fragment and opens a
// short-lived recovery session; PASSWORD_RECOVERY is the signal to show the "set new password"
// step instead of navigating anywhere on our own.
sb.auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY'){
    try{
      document.getElementById('fp-title').textContent='🔑 Set a New Password';
      document.getElementById('fp-step1').style.display='none';
      document.getElementById('fp-step2').style.display='block';
      document.getElementById('fp-err2').textContent='';
      document.getElementById('fp-newpw').value='';
      document.getElementById('fp-confpw').value='';
      document.getElementById('forgotpw-modal').classList.add('open');
    }catch(e){console.error('Could not open recovery UI:',e);}
  }
});


// ── EMAILJS CONFIG ── Fill these in from your EmailJS dashboard (see EMAILJS_SETUP.md). ──
// Until filled in, statement/OTP emails fall back to visible on-screen codes / toasts so the app still works.
const EMAILJS_CONFIG={
  publicKey:'sKjj2OKNRQiQnQX6w',          // Account → General → Public Key
  serviceId:'service_xbgne6r',            // Email Services → your connected service
  otpTemplateId:'template_5mn6y4g',       // Template for the optional login 2FA code (password reset now uses Supabase's own recovery email, not this)
  statementTemplateId:'template_h9qk8zy'  // Template for monthly statement
};
const EMAILJS_READY=typeof emailjs!=='undefined' && EMAILJS_CONFIG.publicKey!=='YOUR_PUBLIC_KEY';
if(EMAILJS_READY){ try{ emailjs.init({publicKey:EMAILJS_CONFIG.publicKey}); }catch(e){ console.warn('EmailJS init failed',e); } }
// Absolute URL to the app icon, so email templates (which live on EmailJS's servers, not in this
// page) can show a real logo image. Resolves correctly once this app is deployed to a real URL
// (e.g. GitHub Pages); will be a file:// path (and won't render in email) if opened locally.
// Wrapped in try/catch: some sandboxed/preview environments give a location.href that isn't a
// valid base URL (e.g. "about:srcdoc"), which makes `new URL()` throw — and since this used to
// run unguarded at the top of the script, that crashed the ENTIRE app, not just this one feature.
let APP_LOGO_URL='';
try{
  APP_LOGO_URL=new URL('icon-512.png',location.href).href;
}catch(e){
  console.warn('Could not resolve absolute logo URL (non-fatal):',e);
  APP_LOGO_URL='';
}
async function sendEmailViaEmailJS(templateId, params){
  if(!EMAILJS_READY) return {ok:false, reason:'not_configured'};
  if(!templateId || templateId.indexOf('YOUR_')===0){
    console.error('EmailJS: template ID looks like an unfilled placeholder:', templateId);
    return {ok:false, reason:'not_configured'};
  }
  try{
    await emailjs.send(EMAILJS_CONFIG.serviceId, templateId, params);
    return {ok:true};
  }catch(e){
    // EmailJS errors usually arrive as {status, text} — surface the real reason (bad service/template
    // ID, template variable mismatch, disabled service, monthly quota hit, etc.) instead of hiding it.
    const detail=(e&&(e.text||e.message))?String(e.text||e.message):(typeof e==='string'?e:'Unknown error');
    console.error('EmailJS send failed:', e);
    return {ok:false, reason:'send_failed', detail};
  }
}

// ── SAFE HTML RENDERING HELPERS ──
// escHtml(): use for any user-controlled string placed as TEXT inside innerHTML (category names,
// tags, usernames, display names, support messages, error log text, etc.) so it can never be
// interpreted as markup/script. escJsAttr(): use for user-controlled strings interpolated inside
// a single-quoted inline onclick="fn('...')" attribute, so a value containing a quote can't break
// out of the JS string OR the surrounding HTML attribute (which also prevents it from breaking app
// functionality, not just security).
function escHtml(s){
  return String(s===null||s===undefined?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escJsAttr(s){
  return String(s===null||s===undefined?'':s)
    .replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;')
    .replace(/\n/g,'\\n').replace(/</g,'\\x3C').replace(/>/g,'\\x3E');
}

// ── GENERIC THEMED CONFIRM / ALERT MODAL ──
// Replaces raw browser confirm()/alert()/prompt() with the app's own modal system so destructive
// actions (delete category, delete account, delete entry, etc.) look and feel consistent, work
// with the existing theme, and don't block the JS thread the way native dialogs do.
let _confirmModalCallback=null;
let _confirmModalRequiredText=null;
function showConfirmModal(opts){
  opts=opts||{};
  document.getElementById('confirm-modal-icon').textContent=opts.icon||'⚠️';
  document.getElementById('confirm-modal-title').textContent=opts.title||'Are you sure?';
  document.getElementById('confirm-modal-msg').textContent=opts.message||'';
  const err=document.getElementById('confirm-modal-err');
  err.style.display='none';err.textContent='';
  const okBtn=document.getElementById('confirm-modal-ok-btn');
  okBtn.textContent=opts.confirmText||'Confirm';
  okBtn.style.background=opts.danger===false?'var(--accent)':'var(--red)';
  const cancelBtn=document.getElementById('confirm-modal-cancel-btn');
  cancelBtn.style.display=opts.hideCancel?'none':'block';
  const inputWrap=document.getElementById('confirm-modal-input-wrap');
  const input=document.getElementById('confirm-modal-input');
  if(opts.requireTypedText){
    inputWrap.style.display='block';
    document.getElementById('confirm-modal-input-label').textContent=opts.inputLabel||`Type "${opts.requireTypedText}" to confirm`;
    input.value='';input.placeholder=opts.requireTypedText;
    _confirmModalRequiredText=opts.requireTypedText;
  } else {
    inputWrap.style.display='none';
    _confirmModalRequiredText=null;
  }
  _confirmModalCallback=opts.onConfirm||null;
  document.getElementById('confirm-modal').classList.add('open');
  if(opts.requireTypedText)setTimeout(()=>input.focus(),150);
}
function showAlertModal(opts){
  if(typeof opts==='string')opts={message:opts};
  showConfirmModal({
    icon:opts.icon||(opts.error?'⚠️':'✅'),
    title:opts.title||(opts.error?'Something went wrong':'Notice'),
    message:opts.message||'',
    confirmText:opts.confirmText||'OK',
    danger:false,
    hideCancel:true,
    onConfirm:opts.onConfirm||null
  });
}
function closeConfirmModal(){
  document.getElementById('confirm-modal').classList.remove('open');
  _confirmModalCallback=null;_confirmModalRequiredText=null;
}
function runConfirmModal(){
  if(_confirmModalRequiredText){
    const typed=document.getElementById('confirm-modal-input').value.trim();
    if(typed!==_confirmModalRequiredText){
      const err=document.getElementById('confirm-modal-err');
      err.style.display='block';
      err.textContent=`Please type "${_confirmModalRequiredText}" exactly to confirm.`;
      return;
    }
  }
  const cb=_confirmModalCallback;
  closeConfirmModal();
  if(cb)cb();
}
document.getElementById('confirm-modal').addEventListener('click',function(e){if(e.target===this)closeConfirmModal();});

// ── CLOUD SYNC STATUS ──
// Central place that reflects real sync state in the topbar pill + drawer, instead of only ever
// implying success. States: connected, syncing, offline, failed, reconnecting.
const CLOUD_STATUS_LABELS={connected:'Connected',syncing:'Syncing…',offline:'Offline',failed:'Sync failed',reconnecting:'Reconnecting…'};
let _cloudStatusState='offline';
function setCloudStatus(state,detail){
  if(!CLOUD_STATUS_LABELS[state])state='offline';
  _cloudStatusState=state;
  const pill=document.getElementById('cloud-status-pill');
  const label=document.getElementById('cloud-status-label');
  if(pill){pill.dataset.state=state;}
  if(label){label.textContent=CLOUD_STATUS_LABELS[state];}
  const drawerEl=document.getElementById('drawer-synccount');
  if(drawerEl){
    const time=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    drawerEl.textContent='Cloud sync: '+CLOUD_STATUS_LABELS[state]+(detail?' — '+detail:'')+' ('+time+')';
  }
}
function updateOnlineStatus(){
  if(!navigator.onLine){setCloudStatus('offline');return;}
  // Coming back online after being offline — show a brief "reconnecting" beat before the next
  // sync call (kicked off by the online listener below) resolves to connected/failed.
  if(_cloudStatusState==='offline')setCloudStatus('reconnecting');
}
// Multiple sync calls (transactions + debts, etc.) can run concurrently at login. Track them as a
// group so a later success never silently overwrites/hides an earlier failure — the pill only
// reports "Connected" once every in-flight sync op has actually succeeded.
let _pendingSyncOps=0,_syncGroupFailed=false;
function beginSyncOp(){
  _pendingSyncOps++;
  if(!navigator.onLine){setCloudStatus('offline');return;}
  setCloudStatus('syncing');
}
function endSyncOp(failed,detail){
  _pendingSyncOps=Math.max(0,_pendingSyncOps-1);
  if(failed)_syncGroupFailed=true;
  if(_pendingSyncOps===0){
    if(!navigator.onLine)setCloudStatus('offline');
    else if(_syncGroupFailed)setCloudStatus('failed',detail);
    else setCloudStatus('connected',detail);
    _syncGroupFailed=false;
  }
}
window.addEventListener('online',()=>{updateOnlineStatus();if(typeof CU!=='undefined'&&CU){runCloudSyncAfterLogin();}});
window.addEventListener('offline',updateOnlineStatus);

// ── BUTTON LOADING STATE (login/signup/etc.) ──
// Shared helper so any primary action button can show a spinner + be disabled while an async
// call is in flight, and prevents duplicate submissions from a fast double-tap.
function setBtnLoading(btnId,loading,loadingLabel){
  const btn=document.getElementById(btnId);
  if(!btn)return;
  if(loading){
    if(btn.disabled)return; // already loading — ignore a duplicate call
    btn.dataset.origLabel=btn.innerHTML;
    btn.disabled=true;
    btn.innerHTML=`<span class="btn-spinner"></span>${loadingLabel||'Please wait…'}`;
  } else {
    btn.disabled=false;
    if(btn.dataset.origLabel){btn.innerHTML=btn.dataset.origLabel;delete btn.dataset.origLabel;}
  }
}

const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const COLORS=['#6c63ff','#ff6584','#00d084','#ffb300','#00bcd4','#e91e63','#ff9800','#4caf50','#9c27b0','#f44336','#2196f3','#ff5722'];
const EMOJIS={Rent:'🏠',Travel:'✈️',Food:'🍔',Medical:'💊',Debt:'💳',Savings:'🐷',Salary:'💰',Other:'📦'};
const DEFAULT_CATS=['Salary','Rent','Travel','Food','Medical','Debt','Savings','Other'];
const APP_VERSION='3.0';

// ── ERROR LOGS (Admin Panel) — captures runtime errors on this device so an admin can review
// what's actually going wrong for users, instead of relying on people accurately describing bugs.
// This is necessarily per-device (a static client-only app has no server to centralize logs on),
// so it's most useful combined with the "Contact Admin" messages feature.
const ERROR_LOG_KEY='exp_error_logs';
const ERROR_LOG_MAX=50;
function getErrorLogs(){try{return JSON.parse(localStorage.getItem(ERROR_LOG_KEY)||'[]');}catch(e){return [];}}
function pushErrorLog(entry){
  try{
    const logs=getErrorLogs();
    logs.unshift({...entry,ts:Date.now(),user:CU||null});
    if(logs.length>ERROR_LOG_MAX)logs.length=ERROR_LOG_MAX;
    localStorage.setItem(ERROR_LOG_KEY,JSON.stringify(logs));
  }catch(e){/* localStorage full or unavailable — nothing more we can do */}
}
function clearErrorLogs(){localStorage.removeItem(ERROR_LOG_KEY);if(typeof renderErrorLogs==='function')renderErrorLogs();}
window.addEventListener('error',function(e){
  pushErrorLog({message:e.message||'Unknown error',source:e.filename?`${e.filename}:${e.lineno||'?'}`:'unknown',stack:(e.error&&e.error.stack)?String(e.error.stack).slice(0,500):null});
});
window.addEventListener('unhandledrejection',function(e){
  const reason=e.reason;
  pushErrorLog({message:'Unhandled promise rejection: '+(reason&&reason.message?reason.message:String(reason)),source:'promise',stack:(reason&&reason.stack)?String(reason.stack).slice(0,500):null});
});


// ── THEME (Light/Dark) ── Saved globally on this device, independent of which account is logged in ──
function getTheme(){return localStorage.getItem('exp_theme')||'dark';}
function getContrastMode(){return localStorage.getItem('exp_contrast')==='on';}
async function toggleContrastMode(){
  localStorage.setItem('exp_contrast',getContrastMode()?'off':'on');

  applyTheme(getTheme());

  await saveAppearanceSettingsCloud();
}
function applyTheme(t){
  const effective=getContrastMode()?'contrast':t;
  document.documentElement.setAttribute('data-theme',effective);
  const icon=t==='light'?'☀️':'🌙';
  const appBtn=document.getElementById('theme-toggle-app');
  const authBtn=document.getElementById('theme-toggle-auth');
  const lockBtn=document.getElementById('theme-toggle-lock');
  if(appBtn)appBtn.textContent=icon;
  if(authBtn)authBtn.textContent=icon;
  if(lockBtn)lockBtn.textContent=icon;
  const drawerIcon=document.getElementById('drawer-theme-icon');
  const drawerLabel=document.getElementById('drawer-theme-label');
  if(drawerIcon)drawerIcon.textContent=icon;
  if(drawerLabel)drawerLabel.textContent=t==='light'?'Switch to Dark Theme':'Switch to Light Theme';
  const contrastLabel=document.getElementById('drawer-contrast-label');
  if(contrastLabel)contrastLabel.textContent=getContrastMode()?'Turn Off High Contrast':'Turn On High Contrast';
  const metaTheme=document.querySelector('meta[name="theme-color"]');
  if(metaTheme)metaTheme.setAttribute('content',effective==='contrast'?'#000000':t==='light'?'#f4f5fa':'#0f1117');
}
async function toggleTheme(){
  const next=getTheme()==='light'?'dark':'light';

  localStorage.setItem('exp_theme',next);
  applyTheme(next);

  await saveAppearanceSettingsCloud();
}
applyTheme(getTheme()); // apply immediately on script load, before login, so it's consistent from the first paint

// ── Large text accessibility mode (item #47) — saved globally on this device ──
function getTextSize(){return localStorage.getItem('exp_textsize')||'normal';}
function applyTextSize(sz){
  document.documentElement.setAttribute('data-textsize',sz);
  const label=document.getElementById('drawer-textsize-label');
  if(label)label.textContent=sz==='large'?'Switch to Normal Text':'Switch to Large Text';
}
async function toggleTextSize(){
  const next=getTextSize()==='large'?'normal':'large';

  localStorage.setItem('exp_textsize',next);
  applyTextSize(next);

  await saveAppearanceSettingsCloud();
}
applyTextSize(getTextSize());

let CU=null,selMonth=null,selCat=null,filterMonth='All',selDebtType=null,pendingAv=null,selEntryType='expense',histSearch='';
let editIndex=null,editMonth=null,editCat=null,editTags=[];
let advFilters={type:'All',cat:'All',payMode:'All',min:null,max:null};
let selPayMode='cash',selUPIApp='',selRisk='low',selGoal='growth',selTH='intraday',debtFilter='all';
let selRemType='expense';
let cropOffX=0,cropOffY=0,cropZoom=1,cropDragging=false,cropDragSX=0,cropDragSY=0,cropStartOX=0,cropStartOY=0;

// ── STORAGE ──
function uKey(k){return'exp_'+CU+'_'+k;}
function getUsers(){return JSON.parse(localStorage.getItem('exp_users')||'{}');}
function saveUsers(u){localStorage.setItem('exp_users',JSON.stringify(u));}
// ── Admin messages (customer service) — global, not scoped to a single user ──
function getAdminMessages(){return JSON.parse(localStorage.getItem('exp_admin_messages')||'[]');}
function saveAdminMessages(m){localStorage.setItem('exp_admin_messages',JSON.stringify(m));}
function getData(){return JSON.parse(localStorage.getItem(uKey('data'))||'[]');}
function saveData(d){localStorage.setItem(uKey('data'),JSON.stringify(d));}
  async function syncCategories(){
  if(!CU) return;

  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;

  const { data, error } = await sb
    .from("categories")
    .select("*")
    .eq("user_id", userId);

  if(error){
    console.error("Categories sync failed:", error);
    return;
  }

  const cats = [...new Set([
    ...DEFAULT_CATS,
    ...(data || []).map(x => x.name)
  ])];

  localStorage.setItem(uKey("cats"), JSON.stringify(cats));
}

async function uploadCategories(){
  if(!CU) return;

  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;

  const cats = JSON.parse(localStorage.getItem(uKey("cats")) || "[]");

  for(const cat of cats){
    const { data: exists } = await sb
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", cat)
      .maybeSingle();

    if(!exists){
      await sb
        .from("categories")
        .insert({
          user_id: userId,
          name: cat
        });
    }
  }
}

async function saveCatsCloud(cats){
  saveCats(cats);
  await uploadCategories();
}
function getCats(){
  const c=JSON.parse(localStorage.getItem(uKey('cats'))||JSON.stringify(DEFAULT_CATS));
  if(CU&&!c.includes('Salary')){c.unshift('Salary');saveCats(c);}
  return c;
}
function saveCats(c){
  localStorage.setItem(uKey('cats'),JSON.stringify(c));

  // Upload categories to Supabase (don't block the UI)
  uploadCategories().catch(err=>{
    console.error("Category upload failed:", err);
  });
}
function getDebts(){return JSON.parse(localStorage.getItem(uKey('debts'))||'[]');}
function saveDebts(d){localStorage.setItem(uKey('debts'),JSON.stringify(d));}
function getBudgetLimit(){return parseFloat(localStorage.getItem(uKey('budget'))||'0')||0;}
function getRolloverEnabled(){return localStorage.getItem(uKey('rollover'))==='on';}
async function setBudgetRollover(on){
  localStorage.setItem(uKey('rollover'),on?'on':'off');

  await saveUserSettingsCloud();

  renderHome();
}
// Rollover amount = last month's leftover budget (only counted if rollover is enabled and last month wasn't over budget)
function getRolloverAmount(){
  if(!getRolloverEnabled())return 0;
  const base=getBudgetLimit();
  if(!base)return 0;
  const now=new Date();
  const prevMonthDate=new Date(now.getFullYear(),now.getMonth()-1,1);
  const prevMonthName=MONTHS[prevMonthDate.getMonth()];
  const prevYear=prevMonthDate.getFullYear();
  const prevExpense=getData().filter(e=>e.type!=='income'&&e.month===prevMonthName&&(e.year||now.getFullYear())===prevYear).reduce((s,e)=>s+e.amount,0);
  const leftover=base-prevExpense;
  return leftover>0?leftover:0;
}
function getCatBudgets(){return JSON.parse(localStorage.getItem(uKey('catBudgets'))||'{}');}
  async function uploadCategoryBudget(category, amount){
  if(!CU) return;

  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;

  const { data: existing } = await sb
    .from("category_budgets")
    .select("id")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle();

  if(existing){
    await sb
      .from("category_budgets")
      .update({
        monthly_budget: amount
      })
      .eq("id", existing.id);
  }else{
    await sb
      .from("category_budgets")
      .insert({
        user_id: userId,
        category: category,
        monthly_budget: amount
      });
  }
}

async function deleteCategoryBudget(category){
  if(!CU) return;

  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;

  await sb
    .from("category_budgets")
    .delete()
    .eq("user_id", userId)
    .eq("category", category);
}
  async function syncCategoryBudgets(){
  if(!CU) return;

  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;

  const { data, error } = await sb
    .from("category_budgets")
    .select("*")
    .eq("user_id", userId);

  if(error){
    console.error("Budget sync failed:", error);
    return;
  }

  const budgets = {};

  (data || []).forEach(row=>{
    budgets[row.category] = Number(row.monthly_budget);
  });

  localStorage.setItem(
    uKey("catBudgets"),
    JSON.stringify(budgets)
  );
}
async function setCatBudget(cat,val){
  const b=getCatBudgets();
  const v=parseFloat(val);

  if(!v || v<=0){
    delete b[cat];
    deleteCategoryBudget(cat).catch(console.error);
  }else{
    b[cat]=v;
    uploadCategoryBudget(cat,v).catch(console.error);
  }

  localStorage.setItem(uKey('catBudgets'),JSON.stringify(b));
  renderHome();
}
  async function uploadUserSettings(){
  if(!CU) return;

  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;

  const monthlyBudget = getBudgetLimit();
  const rollover = getRolloverEnabled();
    const theme = getTheme();
const textSize = getTextSize();
const highContrast = getContrastMode();

  const { data: existing } = await sb
    .from("user_settings")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if(existing){
    await sb
      .from("user_settings")
      .update({
  monthly_budget: monthlyBudget,
  rollover: rollover,
  theme: theme,
  text_size: textSize,
  high_contrast: highContrast
})
      .eq("id", existing.id);
  }else{
    await sb
      .from("user_settings")
     .insert({
  user_id: userId,
  monthly_budget: monthlyBudget,
  rollover: rollover,
  theme: theme,
  text_size: textSize,
  high_contrast: highContrast
})
  }
}

async function syncUserSettings(){
  if(!CU) return;

  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;

  const { data, error } = await sb
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if(error || !data) return;

  localStorage.setItem(
    uKey("budget"),
    String(data.monthly_budget || 0)
  );

  localStorage.setItem(
    uKey("rollover"),
    data.rollover ? "on" : "off"
  );
  if(data.theme){
  localStorage.setItem("exp_theme", data.theme);
}

if(data.text_size){
  localStorage.setItem("exp_textsize", data.text_size);
}

localStorage.setItem(
  "exp_contrast",
  data.high_contrast ? "on" : "off"
);

applyTextSize(getTextSize());
applyTheme(getTheme());
}
async function saveAppearanceSettingsCloud(){
  await uploadUserSettings();
}
async function saveUserSettingsCloud(){
  await uploadUserSettings();
}
async function saveBudgetLimit(){
  const v=parseFloat(document.getElementById('budget-limit-input').value);

  if(!v || v<=0){
    localStorage.removeItem(uKey('budget'));
    showToast('Budget limit cleared','#ffb300');
  }else{
    localStorage.setItem(uKey('budget'),String(v));
    showToast('🎯 Budget saved!');
  }

  await saveUserSettingsCloud();

  renderHome();
}
// Global update store (shared across all users)

// ── AUTH ──
function switchAuthTab(t){
  document.getElementById('form-login').style.display=t==='login'?'block':'none';
  document.getElementById('form-signup').style.display=t==='signup'?'block':'none';
  document.getElementById('atab-login').classList.toggle('active',t==='login');
  document.getElementById('atab-signup').classList.toggle('active',t==='signup');
  document.getElementById('lerr').textContent='';
  document.getElementById('serr').textContent='';
}
function handleAvatar(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>openCropModal(ev.target.result);
  r.readAsDataURL(f);
}
// CROP MODAL
function openCropModal(src){
  cropOffX=0;cropOffY=0;cropZoom=1;cropDragging=false;
  // Show the modal FIRST so #crop-stage is display:flex (not display:none) before we measure it below.
  // Measuring a hidden element's offsetWidth/offsetHeight returns 0, which previously made the
  // base scale 0 and produced a blank (black, once exported as JPEG) profile picture.
  document.getElementById('crop-modal').classList.add('open');
  const img=document.getElementById('crop-img');
  img.onload=()=>{
    const stage=document.getElementById('crop-stage');
    const sw=stage.offsetWidth,sh=stage.offsetHeight;
    const iw=img.naturalWidth,ih=img.naturalHeight;
    const scale=Math.max(sw/iw,sh/ih);
    img._baseScale=scale;cropZoom=1;
    document.getElementById('crop-zoom').value=1;
    cropOffX=(sw-iw*scale)/2;cropOffY=(sh-ih*scale)/2;
    applyCropTransform();
  };
  img.src=src;
}
function applyCropTransform(){
  const img=document.getElementById('crop-img');
  const scale=img._baseScale*(parseFloat(document.getElementById('crop-zoom').value)||1);
  img.style.transform=`translate(${cropOffX}px,${cropOffY}px) scale(${scale})`;
  img.style.transformOrigin='0 0';
}
function closeCropModal(){document.getElementById('crop-modal').classList.remove('open');}
function applyCrop(){
  const stage=document.getElementById('crop-stage');
  const img=document.getElementById('crop-img');
  if(!img._baseScale||!img.naturalWidth){showToast('Photo is still loading, try again in a moment','#ffb300');return;}
  const sw=stage.offsetWidth,sh=stage.offsetHeight;
  const canvas=document.createElement('canvas');
  canvas.width=sw;canvas.height=sh;
  const ctx=canvas.getContext('2d');
  ctx.beginPath();ctx.arc(sw/2,sh/2,sw/2,0,Math.PI*2);ctx.clip();
  const scale=img._baseScale*(parseFloat(document.getElementById('crop-zoom').value)||1);
  ctx.drawImage(img,cropOffX,cropOffY,img.naturalWidth*scale,img.naturalHeight*scale);
  pendingAv = canvas.toDataURL('image/jpeg', .85);

  document.getElementById('av-box').innerHTML=`<img src="${pendingAv}" alt="Avatar preview"/>`;
  closeCropModal();
  if(CU){
    const av=document.getElementById('tb-av');
    av.innerHTML=`<img src="${pendingAv}" alt="Avatar preview" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    const users = getUsers();

if(users[CU]){
    users[CU].avatar = pendingAv;

    saveUsers(users);

    syncDrawerProfile(users[CU]);
}
  }
}
(function(){
  const stage=document.getElementById('crop-stage');
  function getXY(e){return e.touches?{x:e.touches[0].clientX,y:e.touches[0].clientY}:{x:e.clientX,y:e.clientY};}
  stage.addEventListener('mousedown',ev=>{cropDragging=true;const p=getXY(ev);cropDragSX=p.x;cropDragSY=p.y;cropStartOX=cropOffX;cropStartOY=cropOffY;});
  stage.addEventListener('touchstart',ev=>{cropDragging=true;const p=getXY(ev);cropDragSX=p.x;cropDragSY=p.y;cropStartOX=cropOffX;cropStartOY=cropOffY;},{passive:true});
  function onMove(ev){
    if(!cropDragging)return;
    const p=getXY(ev);
    cropOffX=cropStartOX+(p.x-cropDragSX);
    cropOffY=cropStartOY+(p.y-cropDragSY);
    applyCropTransform();
  }
  window.addEventListener('mousemove',onMove);
  window.addEventListener('touchmove',onMove,{passive:true});
  window.addEventListener('mouseup',()=>cropDragging=false);
  window.addEventListener('touchend',()=>cropDragging=false);
})();

// ── AUTHENTICATION ──
// Supabase Auth is the only password authority. The browser never stores, reads,
// compares, or synchronizes public.users.password_hash. The local account object
// contains profile/session metadata only.
async function doLogin(){
  // Duplicate-submission guard: ignore a second click/Enter while a login attempt is already
  // in flight (e.g. slow network + impatient double-tap), instead of firing two overlapping
  // requests.
  const btn=document.getElementById('login-btn');
  if(btn&&btn.disabled)return;

  const u=document.getElementById('lu').value.trim().toLowerCase();
  const p=document.getElementById('lp').value;
  const errEl=document.getElementById('lerr');
  errEl.textContent='';errEl.classList.remove('ok');

  if(!u){errEl.textContent='Enter your username.';return;}
  if(!p){errEl.textContent='Enter your password.';return;}

  setBtnLoading('login-btn',true,'Logging in…');
  try{
    // 1) Resolve username -> the email Supabase Auth actually knows about. This RPC is the
    // only thing allowed to see that mapping from the anon key's perspective.
    const { email: authEmail, error: rpcError } = await resolveEmailForUsername(u);
    if (rpcError) {
      console.error('get_auth_email_by_username failed:', rpcError);
      errEl.textContent = "Database error. Check your connection and try again.";
      return;
    }
    if (!authEmail) {
      errEl.textContent = "Username not found.";
      return;
    }

    // 2) Real authentication — Supabase Auth verifies the password server-side. Nothing in
    // this file ever sees or compares a password hash for this step.
    const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
      email: authEmail,
      password: p
    });
    if (signInError) {
      console.error('signInWithPassword failed:', signInError);
      errEl.textContent = /invalid login credentials/i.test(signInError.message||'')
        ? "Wrong password."
        : (signInError.message || "Login failed. Try again.");
      return;
    }

    // 3) Load this account's public profile row via the auth_user_id link (not by
    // re-trusting the username text box).
    const { data: user, error } = await sb
      .from("users")
      .select("*")
      .eq("auth_user_id", signInData.user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      errEl.textContent = "Database error. Check your connection and try again.";
      return;
    }

    if (!user) {
      errEl.textContent = "Unable to load your account profile.";
      await sb.auth.signOut();
      return;
    }

    const users = getUsers();
    // This device's localStorage may have no local record for this account —
    // e.g. it was created on a different device. Build one from the verified
    // Supabase row instead of crashing on users[u] being undefined.
   if(!users[u]){
  users[u] = {};
}

// Always refresh local profile from Supabase
users[u].name = user.name;
users[u].avatar = user.avatar || null;
users[u].email = user.email;
users[u].mobile = user.mobile || null;
users[u].isAdmin = !!user.is_admin;
users[u].require2FA = !!user.require2FA;
users[u].coverPhoto = user.cover_photo || null;

if(!users[u].createdAt){
  users[u].createdAt = Date.now();
}
if(users[u].lastStatementSent === undefined){
  users[u].lastStatementSent = null;
}
if(users[u].onboarded === undefined){
  users[u].onboarded = true;
}

saveUsers(users);

    if(users[u].require2FA && users[u].email){
      await start2FAChallenge(u);
      return;
    }

    CU=u;
    localStorage.setItem('exp_session',u);
    localStorage.setItem("exp_user_id", user.id);
  await syncCategories();
await syncCategoryBudgets();
await syncUserSettings();
await syncReminders();

startApp(users[u]);
  } catch(e){
    console.error('Login failed:',e);
    errEl.textContent='Something went wrong: '+(e.message||e);
  } finally {
    // Always clear the loading state — including on the require2FA / startApp success paths —
    // so the button never gets stuck disabled if the user logs out and comes back to this screen.
    setBtnLoading('login-btn',false);
  }
}
// (next function starts here — start2FAChallenge...)

// ── Two-Factor Login (item #25) — optional, per-account. If enabled, an OTP email is required ──
// ── after the password before the session actually opens. ──
// ── OTP COUNTDOWN / RESEND COOLDOWN ── shared by the login 2FA modal and the forgot-password
// OTP modal so both get an expiry countdown, a resend cooldown, and a clear expired state,
// without duplicating timer logic (and without ever stacking up duplicate intervals — any
// previous timer for the same element is always cleared before a new one starts).
const OTP_EXPIRY_SECONDS=300;      // 5 minutes
const OTP_RESEND_COOLDOWN_SECONDS=30;
const _otpTimers={};
function initOtpCountdown(countdownElId,resendElId,expirySeconds,cooldownSeconds,onExpire){
  if(_otpTimers[countdownElId]){clearInterval(_otpTimers[countdownElId]);delete _otpTimers[countdownElId];}
  const countdownEl=document.getElementById(countdownElId);
  const resendEl=document.getElementById(resendElId);
  let remaining=expirySeconds,cooldownRemaining=cooldownSeconds;
  function render(){
    if(countdownEl){
      if(remaining<=0){
        countdownEl.textContent='Expired';
        countdownEl.classList.remove('expiring');
        countdownEl.classList.add('expired');
      } else {
        const m=Math.floor(remaining/60),s=remaining%60;
        countdownEl.textContent=m+':'+String(s).padStart(2,'0');
        countdownEl.classList.toggle('expiring',remaining<=30);
        countdownEl.classList.remove('expired');
      }
    }
    if(resendEl){
      if(cooldownRemaining>0){
        resendEl.textContent='Resend code ('+cooldownRemaining+'s)';
        resendEl.classList.add('disabled');
      } else {
        resendEl.textContent='Resend code';
        resendEl.classList.remove('disabled');
      }
    }
  }
  render();
  _otpTimers[countdownElId]=setInterval(()=>{
    if(remaining>0)remaining--;
    if(cooldownRemaining>0)cooldownRemaining--;
    render();
    if(remaining<=0){
      clearInterval(_otpTimers[countdownElId]);
      delete _otpTimers[countdownElId];
      if(onExpire)onExpire();
    }
  },1000);
}
function stopOtpCountdown(countdownElId){
  if(_otpTimers[countdownElId]){clearInterval(_otpTimers[countdownElId]);delete _otpTimers[countdownElId];}
}

const LOGIN_2FA_OTP_TTL_MS=10*60*1000;
const LOGIN_2FA_MAX_ATTEMPTS=5;
let _login2FAUser='',_login2FACode='',_login2FAExpired=false,_login2FAExpiry=0,_login2FAAttempts=0;
async function start2FAChallenge(username){
  const users=getUsers();
  const acc=users[username];
  _login2FAUser=username;
  _login2FACode=String(Math.floor(100000+Math.random()*900000));
  _login2FAExpiry=Date.now()+LOGIN_2FA_OTP_TTL_MS;
  _login2FAAttempts=0;
  _login2FAExpired=false;
  document.getElementById('login2fa-err').textContent='';
  document.getElementById('login2fa-code').value='';
  document.getElementById('login2fa-modal').classList.add('open');
  initOtpCountdown('login2fa-countdown','login2fa-resend-link',LOGIN_2FA_OTP_TTL_MS/1000,OTP_RESEND_COOLDOWN_SECONDS,()=>{
    _login2FAExpired=true;
    document.getElementById('login2fa-err').textContent='This code has expired. Tap "Resend code" to get a new one.';
  });
  const result=await sendEmailViaEmailJS(EMAILJS_CONFIG.otpTemplateId,{
    to_email:acc.email,to_name:acc.name||username,username,otp_code:_login2FACode,
    app_name:'Expenses Tracker',brand_name:'ProjectVault',logo_url:APP_LOGO_URL
  });
  if(!result.ok){
    setTimeout(()=>showToast('Login code: '+_login2FACode+' (email not configured — shown here instead)','#6c63ff'),1200);
  }
}
async function resendLogin2FA(){
  const link=document.getElementById('login2fa-resend-link');
  if(link&&link.classList.contains('disabled'))return;
  if(!_login2FAUser)return;
  // Generating a new code overwrites _login2FACode, which is itself what invalidates
  // the previous code — there's nothing left to compare the old code against.
  await start2FAChallenge(_login2FAUser);
  showToast('📧 New code sent','#00d084');
}
async function verifyLogin2FA(){
  const errEl=document.getElementById('login2fa-err');
  if(!_login2FAUser||!_login2FACode){errEl.textContent='Session expired — please log in again.';return;}
  if(_login2FAExpired||Date.now()>_login2FAExpiry){
    errEl.textContent='This code has expired. Tap "Resend code" to get a new one.';
    _login2FACode=''; // stale code can no longer be used even if somehow guessed
    return;
  }
  const entered=document.getElementById('login2fa-code').value.trim();
  if(!entered){errEl.textContent='Enter the 6-digit code.';return;}
  if(entered!==_login2FACode){
    _login2FAAttempts++;
    if(_login2FAAttempts>=LOGIN_2FA_MAX_ATTEMPTS){
      errEl.textContent='Too many incorrect attempts. Tap "Resend code" for a new one.';
      _login2FACode=''; // lock this code out — must resend to get a fresh one
    } else {
      errEl.textContent='Incorrect code. Try again.';
    }
    return;
  }
  const users=getUsers();
  stopOtpCountdown('login2fa-countdown');
  document.getElementById('login2fa-modal').classList.remove('open');
  CU=_login2FAUser;localStorage.setItem('exp_session',CU);
  _login2FAUser='';_login2FACode='';_login2FAExpiry=0;_login2FAAttempts=0;_login2FAExpired=false;
  // Match the sync steps the non-2FA login path runs before startApp() — the 2FA branch
  // previously skipped these, so 2FA users didn't get categories/budgets/settings/reminders
  // pulled from the cloud on login the way non-2FA users did.
  await syncCategories();
  await syncCategoryBudgets();
  await syncUserSettings();
  await syncReminders();
  startApp(users[CU]);
}
function cancel2FA(){
  stopOtpCountdown('login2fa-countdown');
  document.getElementById('login2fa-modal').classList.remove('open');
  _login2FAUser='';_login2FACode='';_login2FAExpired=false;
  // Password auth already succeeded before this modal opened (that's how Supabase Auth
  // knows require2FA at all), so cancelling here still needs to end that session — otherwise
  // an authenticated-but-not-app-logged-in session lingers in this browser.
  sb.auth.signOut().catch(e=>console.error('signOut after 2FA cancel failed:',e));
}
async function toggleRequire2FA(on){
  if(!CU)return;
  const users=getUsers();
  if(!users[CU])return;
  if(on&&!users[CU].email){showToast('Add an email in your profile first','#ffb300');document.getElementById('require2fa-toggle').checked=false;return;}
  users[CU].require2FA=on;
  saveUsers(users);
  showToast(on?'🔒 Two-factor login enabled':'Two-factor login disabled');
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined)return;
  const{error}=await sb.from('users').update({require2FA:on}).eq('id',userId);
  if(error)console.error('Failed to sync 2FA preference to cloud:',error);
}
// ensureAdminAccount() and the hardcoded ADMIN_USERNAME/ADMIN_PASSWORD constants that used to
// live here have been removed as part of the Supabase Auth migration. Reasons:
//   1. The admin account already exists in Supabase (per the current DB audit) and is linked
//      to Supabase Auth — there is nothing left for a client-side bootstrap to do.
//   2. Inserting a new admin row (with a hardcoded password) directly from the browser using
//      the public anon key, on every app load, is exactly the kind of client-trusted admin
//      creation this audit flags as a release blocker. If a fresh admin account is ever needed,
//      create it the same way any other privileged account should be created: through the
//      Supabase dashboard or an authenticated server-side script, never from anon-key JS.
// Admin status everywhere in this file now comes only from the authenticated profile row's
// is_admin column (profile.isAdmin), never from a username string comparison — see the
// isAdmin checks in startApp()/renderManage() and is_current_user_admin() enforcement in RLS.

async function doSignup(){
  const btn=document.getElementById('signup-btn');
  if(btn&&btn.disabled)return;

  const name=document.getElementById('sn').value.trim();
  const u=document.getElementById('su').value.trim().toLowerCase();
  const p=document.getElementById('sp').value;
  const email=document.getElementById('se').value.trim().toLowerCase();
  const mobile=document.getElementById('sm').value.trim();
  const err=document.getElementById('serr');
  err.textContent='';
  if(!name){err.textContent='Enter your name.';return;}
  if(!u){err.textContent='Choose a username.';return;}
  if(p.length<4){err.textContent='Password min 4 characters.';return;}
  if(!email){err.textContent='Enter your Gmail/email address — needed for statements & password recovery.';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){err.textContent='Enter a valid email address.';return;}
  if(mobile&&!/^\d{10}$/.test(mobile)){err.textContent='Enter a valid 10-digit mobile.';return;}

  setBtnLoading('signup-btn',true,'Creating account…');
  try{
  const users=getUsers();
  // Check username in Supabase
const { data: existingUser, error: userCheckError } = await sb
  .from("users")
  .select("id")
  .eq("username", u)
  .maybeSingle();

if (userCheckError) {
  console.error(userCheckError);
  err.textContent='Database error. Check your connection and try again.';
  return;
}

if (existingUser) {
  err.textContent = "Username already taken.";
  return;
}

// Check email in Supabase
const { data: existingEmail, error: emailCheckError } = await sb
  .from("users")
  .select("id")
  .eq("email", email)
  .maybeSingle();

if (emailCheckError) {
  console.error(emailCheckError);
  err.textContent='Database error. Check your connection and try again.';
  return;
}

if (existingEmail) {
  err.textContent = "An account already uses this email.";
  return;
}

// Check mobile in Supabase (was previously unchecked — username/email were, mobile wasn't)
if (mobile) {
  const { data: existingMobile, error: mobileCheckError } = await sb
    .from("users")
    .select("id")
    .eq("mobile", mobile)
    .maybeSingle();

  if (mobileCheckError) {
    console.error(mobileCheckError);
    err.textContent='Database error. Check your connection and try again.';
    return;
  }

  if (existingMobile) {
    err.textContent = "An account already uses this mobile number.";
    return;
  }
}

  // Create the account through Supabase Auth — this is the only place a password is ever
  // sent anywhere now. The public.users profile row is created server-side by the
  // handle_new_auth_user trigger (already deployed per the DB audit), seeded from the
  // metadata passed in `options.data` below.
  const { data: signUpData, error: signUpError } = await sb.auth.signUp({
    email,
    password: p,
    options: { data: { username: u, name, mobile: mobile || null } }
  });

  if (signUpError) {
    console.error(signUpError);
    err.textContent = /already registered|already exists/i.test(signUpError.message||'')
      ? 'An account already uses this email.'
      : (signUpError.message || 'Signup failed. Try again.');
    return;
  }

  if (!signUpData.session) {
    // Email confirmation is required by this Supabase project's Auth settings before a
    // session is issued. The public.users row should still have been created by the
    // trigger (from raw_user_meta_data), just not usable until the user confirms.
    err.textContent = '';
    switchAuthTab('login');
    showAlertModal({
      icon:'📧',
      title:'Confirm your email',
      message:`We\u2019ve sent a confirmation link to ${email}. Verify it, then log in with your new username and password.`
    });
    return;
  }

  // No confirmation required — session is live immediately. Make sure the profile row
  // (created by the trigger) actually has username/name/mobile/avatar set correctly; do
  // this as an explicit update rather than assuming the trigger's metadata mapping is
  // exactly right, since that mapping lives in Supabase and this audit can't inspect it.
  const { data: profileRow, error: profileFetchError } = await sb
    .from('users')
    .select('*')
    .eq('auth_user_id', signUpData.user.id)
    .maybeSingle();

  if (profileFetchError || !profileRow) {
    console.error('Could not load profile row created by handle_new_auth_user trigger:', profileFetchError);
    err.textContent = 'Account created, but your profile could not be loaded. Try logging in.';
    return;
  }

  const { error: profileUpdateError } = await sb
    .from('users')
    .update({ username: u, name, mobile: mobile || null, avatar: pendingAv || null })
    .eq('auth_user_id', signUpData.user.id);
  if (profileUpdateError) {
    // Not fatal — the trigger may already have set these correctly, or RLS may restrict
    // which columns self-update can touch. Log it and continue with whatever the trigger set.
    console.error('Could not finalize profile fields after signup:', profileUpdateError);
  }

  const finalUsername = profileRow.username || u;
  users[finalUsername] = {
    name,
    avatar: pendingAv || null,
    email,
    mobile: mobile || null,
    isAdmin: false,
    createdAt: Date.now(),
    lastStatementSent: null,
    onboarded: false
  };
  saveUsers(users);
  CU=finalUsername;
  localStorage.setItem('exp_session',CU);
  localStorage.setItem('exp_user_id', profileRow.id);
  startApp(users[CU]);
  setTimeout(showOnboarding,900);
  } catch(e){
    console.error('Signup failed:',e);
    err.textContent='Something went wrong: '+(e.message||e);
  } finally {
    setBtnLoading('signup-btn',false);
  }
}
function doLogout(){
  // ── B2 fix: explicitly tear down Supabase Realtime subscriptions BEFORE clearing session
  // state. Previously only the localStorage session key was cleared and CU was nulled — the
  // _androidRealtimeChannel / _debtsRealtimeChannel subscriptions (and their callbacks) kept
  // running in the background. This also bumps _acctGeneration so any in-flight callback from
  // the outgoing account is invalidated even if teardown itself is racing an inbound event. ──
  if(typeof teardownRealtimeSubscriptions==='function')teardownRealtimeSubscriptions('logout');
  clearTimeout(_inactivityTimer); // prevent a stale lock-screen timer from firing under the next account
  localStorage.removeItem('exp_session');
  // Actually end the Supabase Auth session (not just the local UI marker) — otherwise the
  // access/refresh tokens stay valid in this browser and INIT's getSession() would happily
  // resume it. Fire-and-forget: the UI moves on regardless of network state.
  sb.auth.signOut().catch(e=>console.error('signOut failed:',e));
  CU=null;selMonth=null;selCat=null;filterMonth='All';selDebtType=null;
  document.getElementById('app-screen').style.display='none';
  document.getElementById('lock-screen').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('lu').value='';document.getElementById('lp').value='';
  document.getElementById('lerr').textContent='';switchAuthTab('login');
}
// ── Permanently delete the current account + every trace of its data from this browser ──
function confirmDeleteAccount(){
  if(!CU)return;
  const targetUser=CU;
  showConfirmModal({
    icon:'🗑️',
    title:'Delete your account?',
    message:`This permanently erases the account "${targetUser}" and ALL of its data from this device. This cannot be undone.`,
    confirmText:'Delete Account',
    requireTypedText:'DELETE',
    inputLabel:'Type DELETE to confirm',
    onConfirm:()=>performDeleteAccount(targetUser)
  });
}

function performDeleteAccount(deletedUser){
  const users=getUsers();
  delete users[deletedUser];
  saveUsers(users);
  // Sweep every localStorage key that belongs to this user (expenses, debts, reminders,
  // categories, budget, celebration flags, etc.) — anything prefixed with their username.
  const prefixes=['exp_'+deletedUser+'_','budgetCel_'+deletedUser+'_','savingsCelMax_'+deletedUser];
  const toRemove=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(prefixes.some(p=>k===p||k.startsWith(p)))toRemove.push(k);
  }
  toRemove.forEach(k=>localStorage.removeItem(k));
  localStorage.removeItem('exp_session');
  // Same reasoning as doLogout(): don't leave realtime channels subscribed under a deleted account.
  if(typeof teardownRealtimeSubscriptions==='function')teardownRealtimeSubscriptions('account-deleted');
  clearTimeout(_inactivityTimer);
  CU=null;
  document.getElementById('app-screen').style.display='none';
  document.getElementById('lock-screen').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  switchAuthTab('login');
  showAlertModal({icon:'✅',title:'Account deleted',message:'Your account and all associated data have been permanently deleted from this device.'});
}


// ── LOCK SCREEN (always shown on session resume) ──
function showLockScreen(username){
  const users=getUsers();
  const profile=users[username];
  document.getElementById('app-screen').style.display='none';
  document.getElementById('lock-screen').style.display='flex';
  document.getElementById('lock-user-display').textContent='Logged in as: '+username;
  document.getElementById('lock-pw').value='';
  document.getElementById('lock-err').textContent='';
  // Show biometric button only if this device supports WebAuthn AND this user has
  // actually registered a biometric credential (registration happens in Manage > Security)
  const bioBtn=document.getElementById('bio-btn');
  bioBtn.style.display=(window.PublicKeyCredential&&profile&&profile.bioCredId)?'flex':'none';
}
// ── Session auto-lock: after 5 minutes with no tap/click/scroll/keypress, show the lock ──
// ── screen again (still logged in — just requires the password/biometric to resume). ──
const INACTIVITY_LIMIT_MS=5*60*1000;
let _inactivityTimer=null;
function resetInactivityTimer(){
  if(!CU)return;
  clearTimeout(_inactivityTimer);
  _inactivityTimer=setTimeout(()=>{
    if(CU)showLockScreen(CU);
  },INACTIVITY_LIMIT_MS);
}
['click','touchstart','keydown','scroll'].forEach(evt=>document.addEventListener(evt,resetInactivityTimer,{passive:true}));
// ── WebAuthn helpers (ArrayBuffer <-> base64) ──
function bufToB64(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64){
  const bin=atob(b64);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}
// ── Register a biometric credential for the current user (call from Manage > Security) ──
async function registerBiometric(){
  if(!window.PublicKeyCredential){showToast('Biometric login is not supported on this browser/device','#ffb300');return;}
  if(!CU){showToast('Please log in first','#ffb300');return;}
  try{
    const challenge=new Uint8Array(32);window.crypto.getRandomValues(challenge);
    const users=getUsers();
    const profile=users[CU];
    const userId=new TextEncoder().encode(CU);
    const cred=await navigator.credentials.create({
      publicKey:{
        challenge,
        rp:{name:'Expenses Tracker',id:window.location.hostname||'localhost'},
        user:{id:userId,name:CU,displayName:profile.name||CU},
        pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
        authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},
        timeout:60000,
        attestation:'none'
      }
    });
    if(cred){
      users[CU].bioCredId=bufToB64(cred.rawId);
      saveUsers(users);
      showToast('✅ Biometric login enabled!','#00d084');
      renderManage();
    }
  }catch(e){
    showToast('Could not enable biometric — '+(e.message||'try again'),'#ff6584');
  }
}
function disableBiometric(){
  if(!CU)return;
  const users=getUsers();
  if(users[CU]){
    delete users[CU].bioCredId;
    saveUsers(users);
    showToast('Biometric login disabled','#ffb300');
    renderManage();
  }
}
function toggleBiometricSetting(){
  const users=getUsers();
  const profile=CU&&users[CU];
  if(profile&&profile.bioCredId)disableBiometric();
  else registerBiometric();
}
async function doUnlock(){
  const p=document.getElementById('lock-pw').value;
  const users=getUsers();
  const session=localStorage.getItem('exp_session');
  if(!session||!users[session]||!users[session].email){
    document.getElementById('lock-err').textContent='Session expired. Please log in again.';
    return;
  }
  if(!p){
    document.getElementById('lock-err').textContent='Enter your password.';
    return;
  }

  // Re-authenticate against Supabase Auth instead of checking any locally cached
  // password/hash. This keeps the lock screen on the same authentication authority
  // as normal login and password changes.
  const { error } = await sb.auth.signInWithPassword({
    email: users[session].email,
    password: p
  });
  if(error){
    document.getElementById('lock-err').textContent='Wrong password. Try again.';
    document.getElementById('lock-pw').value='';
    return;
  }

  CU=session;
  // BUG FIX: this path re-authenticates with a real password against Supabase Auth (see above)
  // but then skipped the cloud refresh that both the normal login path and the 2FA login path
  // already run before startApp() (see the matching comment in verifyLogin2FA()) — so data
  // edited on another device between locks wouldn't show up here until the next full login.
  await syncCategories();
  await syncCategoryBudgets();
  await syncUserSettings();
  await syncReminders();
  document.getElementById('lock-screen').style.display='none';
  startApp(users[CU]);
}
async function doBiometric(){
  const session=localStorage.getItem('exp_session');
  const users=getUsers();
  const profile=session&&users[session];
  if(!profile||!profile.bioCredId){
    showToast('Biometric not set up yet — enable it from Manage > Security','#ffb300');
    return;
  }
  try{
    const challenge=new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const credential=await navigator.credentials.get({
      publicKey:{
        challenge,
        timeout:60000,
        rpId:window.location.hostname||'localhost',
        allowCredentials:[{id:b64ToBuf(profile.bioCredId),type:'public-key'}],
        userVerification:'required'
      }
    });
    if(credential){
      // BUG FIX (matches the Sync Failure report): WebAuthn only proves this is the same
      // device/finger — it says nothing to Supabase. Unlike doUnlock() (which re-runs
      // sb.auth.signInWithPassword), this path used to grant app access purely on the local
      // biometric check while never confirming a live Supabase Auth session still existed.
      // If the access/refresh token had expired or been revoked since the page loaded (long-open
      // tab, revoked session, clock skew, etc.), the app would open successfully here but
      // resolveSupabaseUserId() would then fail on the very next sync call — exactly the
      // "Connected on Android / Sync Failure on web" split described in the bug report, since
      // Android re-authenticates fully on every login and never hits this path. We don't have a
      // password to silently re-auth with here, so if there's no live session left, fail closed
      // and send the person to the password field instead of opening the app on a session that
      // can never actually sync.
      const{data:{session:supaSession}}=await sb.auth.getSession();
      if(!supaSession){
        showToast('Your session expired — please log in with your password','#ffb300');
        return;
      }
      CU=session;
      document.getElementById('lock-screen').style.display='none';
      startApp(users[CU]);
    }
  }catch(e){
    // User cancelled, wrong finger/face, or device changed — fall back to password
    showToast('Biometric failed — use password instead','#ffb300');
  }
}

function syncDrawerProfile(profile){
  if(!profile)return;
  const av=document.getElementById('drawer-av');
  if(av){
    if(profile.avatar)av.innerHTML=`<img src="${profile.avatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    else av.textContent=(profile.name||CU||'?').charAt(0).toUpperCase();
  }
  const nameEl=document.getElementById('drawer-name');
  if(nameEl)nameEl.textContent=profile.name||CU;
  const userEl=document.getElementById('drawer-username');
  if(userEl)userEl.textContent='@'+CU;
}
function openDrawer(){
  document.getElementById('drawer-overlay').classList.add('open');
  document.getElementById('side-drawer').classList.add('open');
}
function closeDrawer(){
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('side-drawer').classList.remove('open');
}
// ── Switch Account (item #4) — lists other accounts already used on this device ──
function openSwitchAccountModal(){
  closeDrawer();
  const users=getUsers();
  const others=Object.keys(users).filter(u=>u!==CU&&!users[u].isAdmin);
  const list=document.getElementById('switch-account-list');
  if(!others.length){
    list.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">No other accounts on this device yet.<br>Log out and sign up to add one.</div>';
  } else {
    list.innerHTML=others.map(u=>{
      const p=users[u];
      const av=p.avatar?`<img src="${p.avatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:escHtml((p.name||u).charAt(0).toUpperCase());
      return `<div class="manage-row" style="cursor:pointer" onclick="switchToAccount('${escJsAttr(u)}')">
        <div class="tb-av" style="margin-right:10px">${av}</div>
        <div style="flex:1"><div style="font-size:14px;font-weight:600">${escHtml(p.name||u)}</div><div style="font-size:11px;color:var(--muted)">@${escHtml(u)}</div></div>
        <span style="color:var(--muted);font-size:16px">›</span>
      </div>`;
    }).join('');
  }
  document.getElementById('switch-account-modal').classList.add('open');
}
function switchToAccount(username){
  document.getElementById('switch-account-modal').classList.remove('open');
  doLogout();
  switchAuthTab('login');
  document.getElementById('lu').value=username;
  document.getElementById('lp').focus();
  showToast('Enter password for @'+username,'#6c63ff');
}
// ── Login activity log — last 10 sessions on this device, per account (item #29) ──
function logLoginActivity(){
  if(!CU)return;
  const key=uKey('loginLog');
  const log=JSON.parse(localStorage.getItem(key)||'[]');
  log.unshift({ts:Date.now(),device:getSimpleDeviceLabel()});
  localStorage.setItem(key,JSON.stringify(log.slice(0,10)));
}
function getSimpleDeviceLabel(){
  const ua=navigator.userAgent;
  let os='Unknown device';
  if(/iPhone|iPad/.test(ua))os='iPhone/iPad';
  else if(/Android/.test(ua))os='Android';
  else if(/Windows/.test(ua))os='Windows';
  else if(/Macintosh/.test(ua))os='Mac';
  else if(/Linux/.test(ua))os='Linux';
  let browser='';
  if(/Edg/.test(ua))browser='Edge';
  else if(/Chrome/.test(ua))browser='Chrome';
  else if(/Firefox/.test(ua))browser='Firefox';
  else if(/Safari/.test(ua))browser='Safari';
  return os+(browser?' · '+browser:'');
}
function renderLoginActivity(){
  const el=document.getElementById('login-activity-list');
  if(!el||!CU)return;
  const log=JSON.parse(localStorage.getItem(uKey('loginLog'))||'[]');
  if(!log.length){el.textContent='No login history yet.';return;}
  el.innerHTML=log.map((l,i)=>`${i===0?'<span style="color:var(--green)">●</span>':'○'} ${new Date(l.ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} — ${l.device}`).join('<br>');
}
function startApp(profile){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('lock-screen').style.display='none';
  document.getElementById('app-screen').style.display='block';
  resetInactivityTimer();
  logLoginActivity();
  const av=document.getElementById('tb-av');
  if(profile.avatar){av.innerHTML=`<img src="${profile.avatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}
  else{av.textContent=(profile&&profile.name?profile.name:(CU||'U')).charAt(0).toUpperCase();}
  document.getElementById('tb-hi').textContent='@'+CU;
  syncDrawerProfile(profile);
  resolveSupabaseUserId().then(id=>{
    const el=document.getElementById('drawer-userid');
    if(!el)return;
    if(id) el.textContent='Account ID: '+id;
    else el.textContent='Account ID: NOT RESOLVED (sync will fail — check RLS on users table)';
  });
  checkForAppUpdates();
  selMonth=MONTHS[new Date().getMonth()];
  document.getElementById('expense-date').value=new Date().toISOString().split('T')[0];
  // Populate reminder day select
  const ds=document.getElementById('rem-day');
  ds.innerHTML='<option value="">Day of month</option>';
  for(let i=1;i<=31;i++)ds.innerHTML+=`<option value="${i}">${i}</option>`;
  const urlParams=new URLSearchParams(location.search);
  if(urlParams.get('action')==='add'){
    switchTab('add',document.querySelectorAll('.tab')[1]);
  } else {
    switchTab('home',document.querySelector('.tab'));
  }
  setTimeout(checkDueAlerts,600);
  setInterval(checkDueAlerts,3600000);
  setTimeout(checkForAppUpdates,1000);
  setTimeout(checkAnnouncement,1100);
  // Notification permission MUST be requested from a real tap/click — browsers silently ignore
  // requests triggered by a timer with no user gesture, which was the bug here (permission stayed
  // stuck at "default" forever, so native reminder popups never appeared). Show a real button instead.
  maybeShowNotifPrompt();
  // Show/hide admin sections
  const isAdmin=!!(profile&&profile.isAdmin);
  const supportCard = document.getElementById("support-user-card");

if(supportCard){
    supportCard.style.display = isAdmin ? "none" : "block";
}
  document.getElementById('admin-update-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-stats-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-errorlogs-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-announcement-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-database-section').style.display=isAdmin?'block':'none';
  if(isAdmin){renderAdminStats();renderErrorLogs();updateAnnouncementSyncNote();}
  setTimeout(checkAndSendMonthlyStatement,1500);
  setTimeout(checkAndSendWeeklyDigest,1700);
  setTimeout(checkAndSendAnnualSummary,1900);
  setTimeout(maybeCelebrateBudgetWin,2000);
  setTimeout(maybeCelebrateSavingsMilestone,2200);
  setTimeout(maybeShowDailyNudge,2600);
  runCloudSyncAfterLogin();
  setTimeout(()=>{ if(typeof pvLoadEventsMedia==='function') pvLoadEventsMedia(); if(typeof pvRenderHomeSponsoredMedia==='function') pvRenderHomeSponsoredMedia(); },1300);
}

// ── TABS ──
function switchTab(name,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-selected','false');});
  document.getElementById('page-'+name).classList.add('active');
  el.classList.add('active');
  el.setAttribute('aria-selected','true');
  if(name==='home')renderHome();
  if(name==='add')renderAddForm();
  if(name==='history')renderHistory();
  if(name==='debt')renderDebtPage();
  if(name==='manage')renderManage();
}

// ── HELPERS ──
function emoji(c){return EMOJIS[c]||'📦';}
function color(c){
  const cc=getCatColors();
  if(cc[c])return cc[c];
  const cats=getCats();let i=cats.indexOf(c);return COLORS[(i<0?0:i)%COLORS.length];
}
function getCatColors(){return JSON.parse(localStorage.getItem(uKey('catColors'))||'{}');}
function saveCatColors(c){localStorage.setItem(uKey('catColors'),JSON.stringify(c));}
function setCatColor(catName,hex){
  const cc=getCatColors();cc[catName]=hex;saveCatColors(cc);
  renderManage();renderHome();
}
function resetCatColor(catName){
  const cc=getCatColors();delete cc[catName];saveCatColors(cc);
  renderManage();renderHome();
}
function fmt(n){return'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});}
// ── Animated count-up for currency figures — makes switching months/filters feel ──
// ── alive instead of numbers just snapping to their new value. ──
function animateAmount(el,target){
  if(!el)return;
  const start=parseFloat(el.dataset.rawVal||'0')||0;
  target=Number(target)||0;
  if(Math.abs(target-start)<0.5){el.textContent=fmt(target);el.dataset.rawVal=target;return;}
  const duration=450,startTime=performance.now();
  function step(now){
    const p=Math.min(1,(now-startTime)/duration);
    const eased=1-Math.pow(1-p,3);
    el.textContent=fmt(start+(target-start)*eased);
    if(p<1)requestAnimationFrame(step);
    else{el.textContent=fmt(target);el.dataset.rawVal=target;}
  }
  requestAnimationFrame(step);
}
// Same idea, but for the signed Net Balance figure (can go negative, shows -/+ prefix)
function animateNet(el,target){
  if(!el)return;
  const start=parseFloat(el.dataset.rawVal||'0')||0;
  target=Number(target)||0;
  const render=(v)=>(v<0?'-':'')+fmt(Math.abs(v));
  if(Math.abs(target-start)<0.5){el.textContent=render(target);el.dataset.rawVal=target;return;}
  const duration=450,startTime=performance.now();
  function step(now){
    const p=Math.min(1,(now-startTime)/duration);
    const eased=1-Math.pow(1-p,3);
    el.textContent=render(start+(target-start)*eased);
    if(p<1)requestAnimationFrame(step);
    else{el.textContent=render(target);el.dataset.rawVal=target;}
  }
  requestAnimationFrame(step);
}
function daysDiff(dateStr){
  if(!dateStr)return null;
  const due=new Date(dateStr);const now=new Date();
  now.setHours(0,0,0,0);due.setHours(0,0,0,0);
  return Math.round((due-now)/(1000*60*60*24));
}

// ── HOME ──
// ── Streak tracker — counts consecutive calendar days with at least one entry logged. ──
// ── Still counts as alive if today has nothing yet but yesterday does, so it doesn't ──
// ── vanish the moment you wake up before you've logged anything. ──
function updateStreak(data){
  const card=document.getElementById('streak-card');
  const days=new Set(data.map(e=>e.date).filter(Boolean));
  if(!days.size){card.style.display='none';return;}
  let streak=0;
  const cursor=new Date();cursor.setHours(0,0,0,0);
  if(!days.has(cursor.toISOString().split('T')[0]))cursor.setDate(cursor.getDate()-1);
  while(days.has(cursor.toISOString().split('T')[0])){streak++;cursor.setDate(cursor.getDate()-1);}
  if(streak<1){card.style.display='none';return;}
  card.style.display='block';
  document.getElementById('streak-count').textContent=streak+' day'+(streak===1?'':'s')+' streak';
  document.getElementById('streak-flame').textContent=streak>=30?'🔥🔥🔥':streak>=7?'🔥🔥':'🔥';
}
function daysUntilDue(r){
  const now=new Date();
  const freq=r.frequency||'monthly';
  if(freq==='weekly')return(r.day-now.getDay()+7)%7;
  if(freq==='yearly'){
    let next=new Date(now.getFullYear(),r.month,r.day);
    if(next<now)next=new Date(now.getFullYear()+1,r.month,r.day);
    return Math.ceil((next-now)/86400000);
  }
  if(freq==='quarterly'){
    const createdMonth=new Date(r.id).getMonth();
    for(let add=0;add<12;add++){
      const checkMonth=(now.getMonth()+add)%12;
      const checkYear=now.getFullYear()+Math.floor((now.getMonth()+add)/12);
      if(((checkMonth-createdMonth)+12)%3===0){
        const next=new Date(checkYear,checkMonth,r.day);
        if(next>=new Date(now.getFullYear(),now.getMonth(),now.getDate()))return Math.ceil((next-now)/86400000);
      }
    }
    return 999;
  }
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  return r.day>=now.getDate()?r.day-now.getDate():(daysInMonth-now.getDate())+r.day;
}
function renderUpcomingWeek(){
  const rems=getReminders().filter(r=>r.active!==false);
  const upcoming=[];
  rems.forEach(r=>{
    const daysUntil=daysUntilDue(r);
    const isPaidThisCycle=!!(r.paid&&r.paid[cycleKeyFor(r)]);
    if(daysUntil<=7&&!isPaidThisCycle)upcoming.push(Object.assign({},r,{daysUntil}));
  });
  upcoming.sort((a,b)=>a.daysUntil-b.daysUntil);
  const card=document.getElementById('upcoming-week-card');
  if(!card)return;
  if(!upcoming.length){card.style.display='none';return;}
  card.style.display='block';
  document.getElementById('upcoming-week-list').innerHTML=upcoming.map((r,i)=>{
    const label=r.daysUntil===0?'Today':r.daysUntil===1?'Tomorrow':'In '+r.daysUntil+' days';
    const isIncome=r.type==='income';
    const last=i===upcoming.length-1;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;${last?'':'border-bottom:1px solid var(--border)'}">
      <span style="font-size:16px">${isIncome?'💰':'🔔'}</span>
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${escHtml(r.name)}</div><div style="font-size:11px;color:var(--muted)">${label} · ${fmt(r.amount)}</div></div>
    </div>`;
  }).join('');
}
function renderHome(){
  maybeShowNotifPrompt();
  checkForAppUpdates();
  checkAnnouncement();
  checkUnreadReplies();
  const data=getData();
  const filtered=filterMonth==='All'?data:data.filter(e=>e.month===filterMonth);
  const income=filtered.filter(e=>e.type==='income');
  const expense=filtered.filter(e=>e.type!=='income');
  const incomeAmt=income.reduce((s,e)=>s+e.amount,0);
  const expenseAmt=expense.reduce((s,e)=>s+e.amount,0);
  const net=incomeAmt-expenseAmt;
  const netEl=document.getElementById('grand-total');
  animateNet(netEl,net);
  netEl.style.color=net<0?'var(--red)':net>0?'var(--green)':'var(--text)';
  document.getElementById('total-period').textContent=filterMonth==='All'?'All time':filterMonth+' net balance';
  animateAmount(document.getElementById('home-income'),incomeAmt);
  document.getElementById('home-income-c').textContent=income.length+' entr'+(income.length===1?'y':'ies');
  animateAmount(document.getElementById('home-expense'),expenseAmt);
  document.getElementById('home-expense-c').textContent=expense.length+' entr'+(expense.length===1?'y':'ies');
  // Combined total — sum of both individual cards, so you can see the overall figure at a glance
  const combinedTotal=incomeAmt+expenseAmt;
  animateAmount(document.getElementById('home-combined-total'),combinedTotal);
  document.getElementById('home-combined-count').textContent=filtered.length+' entr'+(filtered.length===1?'y':'ies')+' combined';
  // Only active (not cleared) debts in summary
  const debts=getDebts().filter(d=>!d.cleared);
  const owe=debts.filter(d=>d.type==='debt');
  const recv=debts.filter(d=>d.type==='profit');
  const oweAmt=owe.reduce((s,d)=>s+(d.amount-(d.repaid||0)),0);
  const recvAmt=recv.reduce((s,d)=>s+(d.amount-(d.repaid||0)),0);
  animateAmount(document.getElementById('dp-debt'),oweAmt);
  document.getElementById('dp-debt-c').textContent=owe.length+' active';
  animateAmount(document.getElementById('dp-profit'),recvAmt);
  document.getElementById('dp-profit-c').textContent=recv.length+' active';
  // Category bars
  const bycat={};
  expense.forEach(e=>{bycat[e.category]=(bycat[e.category]||0)+e.amount;});
  const sorted=Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?sorted[0][1]:1;
  const insightCard=document.getElementById('home-insight-card');
  if(sorted.length){
    const [topCat,topAmt]=sorted[0];
    const topPct=expenseAmt>0?Math.round((topAmt/expenseAmt)*100):0;
    insightCard.style.display='block';
    document.getElementById('home-insight-emoji').textContent=emoji(topCat);
    document.getElementById('home-insight-text').innerHTML=`${topCat} — ${fmt(topAmt)} <span style="color:var(--muted);font-weight:500">(${topPct}% of ${filterMonth==='All'?'all-time':filterMonth} spending)</span>`;
  } else {
    insightCard.style.display='none';
  }
  // Per-category budget warnings (always based on the real current month, not the filter)
  const catBudgets=getCatBudgets();
  const warnCard=document.getElementById('cat-budget-warn-card');
  if(Object.keys(catBudgets).length){
    const curMonthName=MONTHS[new Date().getMonth()];
    const curYearNow=new Date().getFullYear();
    const curMonthByCat={};
    data.filter(e=>e.type!=='income'&&e.month===curMonthName&&(e.year||curYearNow)===curYearNow).forEach(e=>{curMonthByCat[e.category]=(curMonthByCat[e.category]||0)+e.amount;});
    const overs=Object.entries(catBudgets).filter(([cat,lim])=>(curMonthByCat[cat]||0)>lim);
    if(overs.length){
      warnCard.style.display='block';
      document.getElementById('cat-budget-warn-list').innerHTML=overs.map(([cat,lim])=>`${emoji(cat)} ${escHtml(cat)}: ${fmt(curMonthByCat[cat])} of ${fmt(lim)}`).join('<br>');
    } else {
      warnCard.style.display='none';
    }
  } else {
    warnCard.style.display='none';
  }
  let html='';
  if(!sorted.length)html='<div class="empty" style="padding:20px 10px"><div class="empty-icon" style="font-size:32px;margin-bottom:6px">📊</div><p>No expenses yet — add one to see your category breakdown.</p></div>';
  sorted.forEach(([cat,amt])=>{
    const pct=Math.round((amt/max)*100),c=color(cat);
    html+=`<div class="cat-row"><div class="cat-dot" style="background:${c}"></div><div style="flex:1"><div style="display:flex;justify-content:space-between"><span style="font-size:14px">${emoji(cat)} ${escHtml(cat)}</span><span style="font-size:14px;font-weight:700;color:${c}">${fmt(amt)}</span></div><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${c}"></div></div></div></div>`;
  });
  document.getElementById('cat-summary').innerHTML=html;
  const recent=[...filtered].sort((a,b)=>b.ts-a.ts).slice(0,8);
  let rhtml='';
  if(!recent.length)rhtml='<div class="empty"><div class="empty-icon">🧾</div><p>No entries yet.<br>Tap + Add to get started.</p></div>';
  recent.forEach(e=>{
    const isInc=e.type==='income';
    const c=isInc?'var(--green)':color(e.category);
    const bg=isInc?'rgba(0,208,132,.15)':color(e.category)+'22';
    const payLabel=e.payMode?`<span style="font-size:10px;margin-left:4px;color:var(--muted)">${e.payMode}</span>`:'';
    const debtTag=e.debtLinked?`<span style="font-size:10px;margin-left:4px;color:var(--muted)">🔁 ${escHtml(e.debtName||'Debt')}</span>`:'';
    rhtml+=`<div class="entry-row"><div class="entry-icon" style="background:${bg}">${isInc?'💰':emoji(e.category)}</div><div class="entry-info"><div class="entry-cat">${escHtml(e.category)} <span class="debt-entry-badge ${isInc?'badge-profit':'badge-debt'}" style="font-size:10px">${isInc?'Income':'Expense'}</span>${payLabel}${debtTag}</div><div class="entry-meta">${e.month} ${e.year||''}${e.date?' • '+escHtml(e.date):''}</div></div><span class="entry-amt" style="color:${c}">${isInc?'+':'−'}${fmt(e.amount)}</span></div>`;
  });
  document.getElementById('recent-list').innerHTML=rhtml;
  updateStreak(data);
  // Budget progress (based on current-month expenses regardless of filter)
  const baseBudget=getBudgetLimit();
  const rolloverAmt=getRolloverAmount();
  const budgetLimit=baseBudget+rolloverAmt;
  const budgetCard=document.getElementById('budget-card');
  if(baseBudget>0){
    budgetCard.style.display='block';
    const curMonth=MONTHS[new Date().getMonth()];
    const monthExpense=data.filter(e=>e.type!=='income'&&e.month===curMonth&&(e.year||new Date().getFullYear())===new Date().getFullYear()).reduce((s,e)=>s+e.amount,0);
    const pct=Math.min(100,Math.round((monthExpense/budgetLimit)*100));
    document.getElementById('budget-spent-label').textContent=fmt(monthExpense)+' spent';
    document.getElementById('budget-limit-label').textContent='of '+fmt(budgetLimit)+(rolloverAmt>0?' (incl. '+fmt(rolloverAmt)+' rolled over)':' ('+curMonth+')');
    const fillEl=document.getElementById('budget-bar-fill');
    fillEl.style.width=pct+'%';
    const over=monthExpense>budgetLimit;
    fillEl.style.background=over?'var(--red)':pct>80?'var(--amber)':'var(--green)';
    const msgEl=document.getElementById('budget-status-msg');
    if(over){msgEl.innerHTML=`<span style="color:var(--red);font-weight:700">⚠️ ${fmt(monthExpense-budgetLimit)} over budget!</span>`;}
    else if(pct>80){msgEl.innerHTML=`<span style="color:var(--amber);font-weight:700">⚠️ Almost there — ${fmt(budgetLimit-monthExpense)} left</span>`;}
    else{msgEl.innerHTML=`<span style="color:var(--muted)">${fmt(budgetLimit-monthExpense)} remaining this month</span>`;}
    // Days-left vs money-left projection
    const now2=new Date();
    const daysInMonth=new Date(now2.getFullYear(),now2.getMonth()+1,0).getDate();
    const daysLeft=daysInMonth-now2.getDate()+1;
    const projEl=document.getElementById('budget-projection');
    if(over){
      projEl.innerHTML=`📅 ${daysLeft} day${daysLeft===1?'':'s'} left this month`;
    } else {
      const moneyLeft=budgetLimit-monthExpense;
      const perDay=daysLeft>0?moneyLeft/daysLeft:moneyLeft;
      projEl.innerHTML=`📅 ${daysLeft} day${daysLeft===1?'':'s'} left · <b style="color:var(--text)">${fmt(perDay)}/day</b> to stay on budget`;
    }
  } else {
    budgetCard.style.display='none';
  }
  renderUpcomingWeek();
}

// ── ADD EXPENSE ──
function renderAddForm(){
  selEntryType=selEntryType||'expense';
  selectEntryType(selEntryType);
  let mh='';
  MONTHS.forEach(m=>{mh+=`<div class="sel-btn${selMonth===m?' sel':''}" onclick="selM('${m}')">${m.slice(0,3)}</div>`;});
  document.getElementById('month-grid').innerHTML=mh;
  renderCatGrid();
  renderReminders();
  const receiptWrap=document.getElementById('receipt-preview-wrap');
  if(receiptWrap&&!pendingReceipt){
    receiptWrap.innerHTML=`<div id="receipt-add-btn" onclick="document.getElementById('receipt-file').click()" style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px dashed var(--border);border-radius:14px;padding:12px;cursor:pointer;font-size:13px;color:var(--muted)"><span style="font-size:18px">📎</span> Attach a photo of the receipt</div><input type="file" id="receipt-file" accept="image/*" style="display:none" onchange="handleReceiptPhoto(event)"/>`;
  }
}
function renderCatGrid(){
  const cats=getCats();let ch='';
  cats.forEach(c=>{ch+=`<div class="sel-btn${selCat===c?' sel':''}" onclick="selC('${escJsAttr(c)}')">${emoji(c)} ${escHtml(c)}</div>`;});
  document.getElementById('cat-grid').innerHTML=ch;
}
function selM(m){selMonth=m;renderAddForm();}
function selC(c){selCat=c;renderCatGrid();}
function selectEntryType(t){
  selEntryType=t;
  const isExp=t==='expense';
  document.getElementById('etype-expense').classList.toggle('sel',isExp);
  document.getElementById('etype-income').classList.toggle('sel',!isExp);
  document.getElementById('amt-pre-sign').style.color=isExp?'var(--red)':'var(--green)';
  const btn=document.getElementById('save-exp-btn');
  btn.style.background=isExp?'var(--red)':'var(--green)';
  btn.textContent=isExp?'Save Expense':'Save Income';
}
// ── PAYMENT MODE ──
function selectPayMode(m){
  selPayMode=m;selUPIApp='';
  ['cash','upi','card','bank'].forEach(k=>{
    document.getElementById('pay-'+k).classList.toggle('sel',k===m);
  });
  const upiGrid=document.getElementById('upi-sub-grid');
  if(m==='upi'){upiGrid.classList.add('open');}
  else{upiGrid.classList.remove('open');updatePayDisplay();}
  document.querySelectorAll('.upi-btn').forEach(b=>b.classList.remove('sel'));
}
function selectUPI(app){
  selUPIApp=app;
  document.querySelectorAll('.upi-btn').forEach(b=>{
    b.classList.toggle('sel',b.textContent.includes(app.split(' ')[0])||b.textContent.toLowerCase().includes(app.toLowerCase().split(' ')[0]));
  });
  updatePayDisplay();
}
function updatePayDisplay(){
  let label='';
  if(selPayMode==='cash')label='💵 Cash';
  else if(selPayMode==='upi')label=selUPIApp?`📱 UPI · ${selUPIApp}`:'📱 UPI';
  else if(selPayMode==='card')label='💳 Card';
  else if(selPayMode==='bank')label='🏦 Bank Transfer';
  document.getElementById('pay-mode-display').textContent=label?`Selected: ${label}`:'';
}
function getPayModeLabel(){
  if(selPayMode==='cash')return'Cash';
  if(selPayMode==='upi')return selUPIApp||'UPI';
  if(selPayMode==='card')return'Card';
  if(selPayMode==='bank')return'Bank Transfer';
  return'';
}
function viewReceipt(idx){
  const data=getData();
  const e=data[idx];
  if(!e||!e.receipt)return;
  document.getElementById('receipt-modal-img').src=e.receipt;
  document.getElementById('receipt-modal').classList.add('open');
}
let _onboardStep=0;
const ONBOARD_STEPS=5;
function showOnboarding(){
  _onboardStep=0;
  renderOnboardStep();
  document.getElementById('onboarding-modal').classList.add('open');
}
function renderOnboardStep(){
  for(let i=0;i<ONBOARD_STEPS;i++){
    document.getElementById('onboard-step-'+i).style.display=i===_onboardStep?'block':'none';
  }
  document.getElementById('onboard-dots').innerHTML=Array.from({length:ONBOARD_STEPS}).map((_,i)=>
    `<span style="width:${i===_onboardStep?18:6}px;height:6px;border-radius:3px;background:${i===_onboardStep?'var(--accent)':'var(--border)'};transition:.2s"></span>`
  ).join('');
  document.getElementById('onboard-next-btn').textContent=_onboardStep===ONBOARD_STEPS-1?"Let's go! 🚀":'Next →';
}
function onboardNext(){
  if(_onboardStep>=ONBOARD_STEPS-1){closeOnboarding();return;}
  _onboardStep++;
  renderOnboardStep();
}
function closeOnboarding(){
  document.getElementById('onboarding-modal').classList.remove('open');
  if(CU){
    const users=getUsers();
    if(users[CU]){users[CU].onboarded=true;saveUsers(users);}
  }
}
let pendingReceipt=null;
function handleReceiptPhoto(e){
  const f=e.target.files[0];if(!f)return;
  const img=new Image();
  const reader=new FileReader();
  reader.onload=ev=>{
    img.onload=()=>{
      // Compress aggressively — receipts are just for reference, not archival quality,
      // and localStorage has a small total quota shared across every entry.
      const maxW=500;
      const scale=Math.min(1,maxW/img.width);
      const canvas=document.createElement('canvas');
      canvas.width=img.width*scale;canvas.height=img.height*scale;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      pendingReceipt=canvas.toDataURL('image/jpeg',.6);
      document.getElementById('receipt-preview-wrap').innerHTML=`
        <div style="position:relative;display:inline-block">
          <img src="${pendingReceipt}" alt="Receipt preview" style="max-width:100px;max-height:100px;border-radius:10px;border:1px solid var(--border)"/>
          <button onclick="pendingReceipt=null;renderAddForm()" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--red);color:#fff;border:none;font-size:11px;cursor:pointer">✕</button>
        </div>`;
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(f);
}
async function saveExpense(){

  const amt = parseFloat(document.getElementById('amount-input').value);

  if(!selMonth){
    showToast('Pick a month first','#ffb300');
    return;
  }

  if(!selCat){
    showToast('Pick a category','#ffb300');
    return;
  }

  if(!amt || amt<=0){
    showToast('Enter a valid amount','#ffb300');
    return;
  }

  const dateVal=document.getElementById('expense-date').value;
  const payMode=getPayModeLabel();

  const tagsRaw=document.getElementById('expense-tags').value;
  const tags=tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);

  const userId = await resolveSupabaseUserId();

  if(userId===null||userId===undefined){
      showToast("User session missing. Please login again.","#e53935");
      return;
  }

  try{

      const { data: inserted, error } = await sb
      .from("transactions")
      .insert({

          user_id: userId,

          amount: amt,

          type: (selEntryType==="income")
                  ? "CREDIT"
                  : "DEBIT",

          category: selCat,

          payment_app: "Manual Entry",

          payment_mode: payMode,

          message: tags.join(", "),

          transaction_date:
              dateVal
              ? new Date(dateVal).toISOString()
              : new Date().toISOString()

      })
      .select()
      .single();

      if(error){
          console.error(error);
          pushErrorLog({message:'Transaction cloud save failed: '+(error.message||JSON.stringify(error)),source:'saveExpense'});
          // Don't lose the user's entry just because the cloud write failed — save it locally
          // (unsynced) so it still shows up correctly, and let them know sync will retry later.
          const localData=getData();
          localData.push({
              month:selMonth,category:selCat,amount:amt,type:selEntryType||'expense',
              year:new Date().getFullYear(),ts:Date.now(),date:dateVal,payMode,tags,
              receipt:pendingReceipt,supaId:null
          });
          saveData(localData);
          document.getElementById('amount-input').value='';
          document.getElementById('expense-tags').value='';
          selCat=null;pendingReceipt=null;
          renderAddForm();
          showToast("Saved on this device — cloud sync failed (see Error Logs)","#ffb300");
          return;
      }

      // existing local cache
      const data=getData();

      data.push({
          month:selMonth,
          category:selCat,
          amount:amt,
          type:selEntryType||'expense',
          year:new Date().getFullYear(),
          ts:Date.now(),
          date:dateVal,
          payMode,
          tags,
          receipt:pendingReceipt,
          supaId:String(inserted.id)
      });

      saveData(data);

      document.getElementById('amount-input').value='';
      document.getElementById('expense-tags').value='';
      selCat=null;
      pendingReceipt=null;

      renderAddForm();

      showToast(
          (selEntryType==='income'?'💰 ':'💸 ')
          +fmt(amt)
          +' saved!'
      );

      haptic('success');

      maybeCelebrateSavingsMilestone();

  }catch(e){

      console.error(e);

      showToast("Unexpected error","#e53935");

  }

}

// ── HISTORY ──
function renderHistory(){
  const data=getData();
  const used=MONTHS.filter(m=>data.some(e=>e.month===m));
  let chips=`<div class="mchip${filterMonth==='All'?' active':''}" onclick="setFilter('All')">All</div>`;
  used.forEach(m=>{chips+=`<div class="mchip${filterMonth===m?' active':''}" onclick="setFilter('${m}')">${m}</div>`;});
  document.getElementById('hist-months').innerHTML=chips;
  let filtered=filterMonth==='All'?data:data.filter(e=>e.month===filterMonth);
  if(histSearch.trim()){
    const q=histSearch.trim().toLowerCase();
    filtered=filtered.filter(e=>{
      const hay=[e.category,e.type,e.payMode,e.month,e.date,e.year,e.amount,e.debtName,...(e.tags||[])].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  // #9 Advanced Filters — layered on top of the existing month/search filters above,
  // not replacing them, so a person can combine "March" + "grocery" + "expense only".
  if(advFilters.type!=='All')filtered=filtered.filter(e=>e.type===advFilters.type);
  if(advFilters.cat!=='All')filtered=filtered.filter(e=>e.category===advFilters.cat);
  if(advFilters.payMode!=='All')filtered=filtered.filter(e=>e.payMode===advFilters.payMode);
  if(advFilters.min!=null)filtered=filtered.filter(e=>Number(e.amount)>=advFilters.min);
  if(advFilters.max!=null)filtered=filtered.filter(e=>Number(e.amount)<=advFilters.max);
  const sorted=[...filtered].sort((a,b)=>b.ts-a.ts);
  let html='';
  if(!sorted.length)html=`<div class="empty"><div class="empty-icon">📭</div><p>No entries found${histSearch.trim()?' for "'+escHtml(histSearch.trim())+'"':''}.</p></div>`;
  sorted.forEach(e=>{
    const c=color(e.category),oi=data.indexOf(e);
    const isInc=e.type==='income';
    const amtColor=isInc?'var(--green)':c;
    const bg=isInc?'rgba(0,208,132,.15)':c+'22';
    const payLabel=e.payMode?` · ${escHtml(e.payMode)}`:'';
    const debtTag=e.debtLinked?` · 🔁 ${escHtml(e.debtName||'Debt')} repayment`:'';
    const tagChips=(e.tags&&e.tags.length)?`<div style="margin-top:4px">${e.tags.map(t=>`<span style="display:inline-block;background:var(--surface2);color:var(--muted);font-size:10px;padding:2px 8px;border-radius:100px;margin-right:4px;margin-top:2px;">#${escHtml(t)}</span>`).join('')}</div>`:'';
    const receiptBtn=e.receipt?`<button class="del-btn" onclick="viewReceipt(${oi})" title="View receipt">🧾</button>`:'';
    html+=`<div class="swipe-wrap" data-idx="${oi}"><div class="swipe-delete-bg">🗑️</div><div class="entry-row swipe-fg" onclick="if(!event.target.closest('button'))openTxnDetails(${oi})"><div class="entry-icon" style="background:${bg}">${isInc?'💰':emoji(e.category)}</div><div class="entry-info"><div class="entry-cat">${escHtml(e.category)} <span class="debt-entry-badge ${isInc?'badge-profit':'badge-debt'}" style="font-size:10px">${isInc?'Income':'Expense'}</span></div><div class="entry-meta">${e.month} ${e.year||''}${e.date?' • '+escHtml(e.date):''}${payLabel}${debtTag}</div>${tagChips}</div><span class="entry-amt" style="color:${amtColor}">${isInc?'+':'−'}${fmt(e.amount)}</span>${receiptBtn}<button class="del-btn" onclick="openEditEntry(${oi})" title="Edit">✏️</button><button class="del-btn" onclick="delEntry(${oi})">✕</button></div></div>`;
  });
  document.getElementById('history-list').innerHTML=html;
  initSwipeToDelete('history-list');
}

// #7 Transaction Details — a dedicated read-only view (source, sync status, reference,
// full tag list) alongside the existing Edit modal, which only exposes editable fields.
function openTxnDetails(i){
  const d=getData();const e=d[i];
  if(!e)return;
  const isInc=e.type==='income';
  // "Source" is inferred from real fields already on the entry (no fabricated field) — Android
  // imports always carry the 'Auto-synced' tag (see androidTxnToEntry), debt entries carry
  // debtLinked. A manual entry with neither is exactly that: created directly in this app.
  const source = e.debtLinked ? 'Debt cashflow' : ((e.tags||[]).includes('Auto-synced') ? 'Imported from Android (auto-synced)' : 'Manual entry');
  const syncStatus = e.supaId ? `✅ Synced (cloud id: ${escHtml(String(e.supaId))})` : '⏳ Not yet synced to cloud';
  const rows=[
    ['Amount', (isInc?'+':'−')+fmt(e.amount)],
    ['Type', isInc?'Income':'Expense'],
    ['Category', escHtml(e.category)],
    ['Date', escHtml(e.date||(e.month+' '+(e.year||'')))],
    ['Payment Mode', e.payMode?escHtml(e.payMode):'—'],
    ['Source', source],
    ['Sync Status', syncStatus],
    ['Tags', (e.tags&&e.tags.length)?e.tags.map(t=>'#'+escHtml(t)).join(', '):'—']
  ];
  if(e.debtLinked)rows.push(['Linked Debt', escHtml(e.debtName||'')]);
  document.getElementById('txn-details-body').innerHTML=rows.map(([k,v])=>
    `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border);padding:6px 0"><span style="color:var(--muted)">${k}</span><span style="text-align:right">${v}</span></div>`
  ).join('');
  document.getElementById('txn-details-modal').classList.add('open');
}

// #9 Advanced Filters
function openAdvancedFilters(){
  let th='';
  ['All','expense','income'].forEach(t=>{th+=`<div class="sel-btn${advFilters.type===t?' sel':''}" onclick="setAdvFilterField('type','${t}')">${t==='All'?'All':(t==='expense'?'Expense':'Income')}</div>`;});
  document.getElementById('filter-type-grid').innerHTML=th;

  let ch=`<div class="sel-btn${advFilters.cat==='All'?' sel':''}" onclick="setAdvFilterField('cat','All')">All</div>`;
  getCats().forEach(c=>{ch+=`<div class="sel-btn${advFilters.cat===c?' sel':''}" onclick="setAdvFilterField('cat','${escJsAttr(c)}')">${emoji(c)} ${escHtml(c)}</div>`;});
  document.getElementById('filter-cat-grid').innerHTML=ch;

  const payModes=[...new Set(getData().map(e=>e.payMode).filter(Boolean))];
  let ph=`<div class="sel-btn${advFilters.payMode==='All'?' sel':''}" onclick="setAdvFilterField('payMode','All')">All</div>`;
  payModes.forEach(p=>{ph+=`<div class="sel-btn${advFilters.payMode===p?' sel':''}" onclick="setAdvFilterField('payMode','${escJsAttr(p)}')">${escHtml(p)}</div>`;});
  document.getElementById('filter-paymode-grid').innerHTML=ph;

  document.getElementById('filter-amt-min').value=advFilters.min??'';
  document.getElementById('filter-amt-max').value=advFilters.max??'';
  document.getElementById('advanced-filters-modal').classList.add('open');
}
function setAdvFilterField(field,val){advFilters[field]=val;openAdvancedFilters();}
function applyAdvancedFilters(){
  const min=document.getElementById('filter-amt-min').value;
  const max=document.getElementById('filter-amt-max').value;
  advFilters.min=min?parseFloat(min):null;
  advFilters.max=max?parseFloat(max):null;
  document.getElementById('advanced-filters-modal').classList.remove('open');
  renderHistory();
}
function clearAdvancedFilters(){
  advFilters={type:'All',cat:'All',payMode:'All',min:null,max:null};
  document.getElementById('advanced-filters-modal').classList.remove('open');
  renderHistory();
}
// ── Swipe-to-delete: left-swipe reveals a 🗑️ action behind each History row. ──
// ── Uses event delegation so it keeps working after every re-render, without ──
// ── re-attaching listeners to individual rows each time. ──
function initSwipeToDelete(containerId){
  const container=document.getElementById(containerId);
  if(!container||container._swipeInit)return;
  container._swipeInit=true;
  let startX=0,curX=0,activeEl=null,dragging=false;
  container.addEventListener('pointerdown',(e)=>{
    if(e.target.closest('button'))return; // let edit/delete buttons work normally
    const fg=e.target.closest('.swipe-fg');
    if(!fg)return;
    activeEl=fg;startX=e.clientX;curX=startX;dragging=true;
    activeEl.style.transition='none';
  });
  container.addEventListener('pointermove',(e)=>{
    if(!dragging||!activeEl)return;
    curX=e.clientX;
    const dx=Math.min(0,Math.max(curX-startX,-90));
    activeEl.style.transform=`translateX(${dx}px)`;
  });
  function endDrag(){
    if(!dragging||!activeEl)return;
    dragging=false;
    const dx=curX-startX;
    activeEl.style.transition='transform .2s ease';
    activeEl.style.transform=dx<-55?'translateX(-90px)':'translateX(0)';
    activeEl=null;
  }
  container.addEventListener('pointerup',endDrag);
  container.addEventListener('pointercancel',endDrag);
  container.addEventListener('pointerleave',endDrag);
  // Tapping the revealed red background deletes that entry
  container.addEventListener('click',(e)=>{
    const bg=e.target.closest('.swipe-delete-bg');
    if(!bg)return;
    const wrap=bg.closest('.swipe-wrap');
    if(wrap)delEntry(parseInt(wrap.dataset.idx));
  });
}
function setFilter(m){filterMonth=m;document.getElementById('month-modal').classList.remove('open');renderHome();renderHistory();}
function toggleDateRangeReport(){
  const body=document.getElementById('date-range-body');
  const caret=document.getElementById('date-range-caret');
  const open=body.style.display==='block';
  body.style.display=open?'none':'block';
  caret.textContent=open?'▾':'▴';
}
function showDateRangeReport(){
  const from=document.getElementById('range-from').value;
  const to=document.getElementById('range-to').value;
  const resultEl=document.getElementById('date-range-result');
  if(!from||!to){resultEl.innerHTML='<div style="color:var(--amber);font-size:12px">Pick both a start and end date.</div>';return;}
  if(from>to){resultEl.innerHTML='<div style="color:var(--amber);font-size:12px">"From" date must be before "To" date.</div>';return;}
  const data=getData().filter(e=>e.date&&e.date>=from&&e.date<=to);
  const income=data.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
  const expense=data.filter(e=>e.type!=='income').reduce((s,e)=>s+e.amount,0);
  const bycat={};
  data.filter(e=>e.type!=='income').forEach(e=>{bycat[e.category]=(bycat[e.category]||0)+e.amount;});
  const sorted=Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  const catRows=sorted.map(([c,amt])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0"><span>${emoji(c)} ${escHtml(c)}</span><span style="color:var(--muted)">${fmt(amt)}</span></div>`).join('');
  resultEl.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1;background:var(--surface2);border-radius:12px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:700;color:var(--green)">${fmt(income)}</div><div style="font-size:10px;color:var(--muted)">Income</div></div>
      <div style="flex:1;background:var(--surface2);border-radius:12px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:700;color:var(--red)">${fmt(expense)}</div><div style="font-size:10px;color:var(--muted)">Expenses</div></div>
      <div style="flex:1;background:var(--surface2);border-radius:12px;padding:10px;text-align:center"><div style="font-size:16px;font-weight:700">${fmt(income-expense)}</div><div style="font-size:10px;color:var(--muted)">Net</div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${data.length} entries · ${from} to ${to}</div>
    ${catRows||'<div style="font-size:12px;color:var(--muted)">No expense entries in this range.</div>'}
  `;
}
function onHistSearch(v){histSearch=v;renderHistory();}
function delEntry(i){
  const d=getData();
  const removed=d[i];
  if(!removed)return;
  d.splice(i,1);saveData(d);renderHistory();renderHome();
  haptic('delete');
  let undone=false;
  showUndoToast('Entry deleted',()=>{
    undone=true;
    const d2=getData();
    d2.splice(i,0,removed);
    saveData(d2);renderHistory();renderHome();
    showToast('✅ Restored');
  });
  if(removed.supaId){
    setTimeout(async()=>{
      if(undone)return;
      const {error}=await sb.from('transactions').delete().eq('id',removed.supaId);
      if(error)console.error('Failed to delete from cloud:',error);
    },5200);
  }
}
// ── EDIT ENTRY ──
function openEditEntry(i){
  const d=getData();const e=d[i];
  if(!e)return;
  editIndex=i;editMonth=e.month;editCat=e.category;
  editTags=[...(e.tags||[])]; // BUG FIX (#10 Transaction Tags): tags previously displayed
  // (from Android-imported entries) but had no way to be added/edited for any entry, manual
  // or otherwise — there was no tag input anywhere in the app.
  document.getElementById('edit-amount-input').value=e.amount;
  document.getElementById('edit-date-input').value=e.date||'';
  document.getElementById('edit-amt-sign').style.color=e.type==='income'?'var(--green)':'var(--red)';
  renderEditGrids();
  renderEditTagChips();
  document.getElementById('edit-entry-modal').classList.add('open');
}
function renderEditTagChips(){
  const el=document.getElementById('edit-tags-chips');
  el.innerHTML = editTags.length ? editTags.map((t,idx)=>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface2);color:var(--muted);font-size:12px;padding:4px 10px;border-radius:100px">#${escHtml(t)} <span style="cursor:pointer;font-weight:700" onclick="removeEditTag(${idx})">×</span></span>`
  ).join('') : '<span style="color:var(--muted);font-size:12px">No tags yet</span>';
}
function addEditTag(){
  const input=document.getElementById('edit-tag-input');
  const raw=input.value.trim().replace(/^#/,'');
  if(!raw)return;
  if(!editTags.includes(raw))editTags.push(raw);
  input.value='';
  renderEditTagChips();
}
function removeEditTag(idx){
  editTags.splice(idx,1);
  renderEditTagChips();
}
function renderEditGrids(){
  let mh='';
  MONTHS.forEach(m=>{mh+=`<div class="sel-btn${editMonth===m?' sel':''}" onclick="selEditMonth('${m}')">${m.slice(0,3)}</div>`;});
  document.getElementById('edit-month-grid').innerHTML=mh;
  const cats=getCats();let ch='';
  cats.forEach(c=>{ch+=`<div class="sel-btn${editCat===c?' sel':''}" onclick="selEditCat('${escJsAttr(c)}')">${emoji(c)} ${escHtml(c)}</div>`;});
  document.getElementById('edit-cat-grid').innerHTML=ch;
}
function selEditMonth(m){editMonth=m;renderEditGrids();}
function selEditCat(c){editCat=c;renderEditGrids();}
function closeEditEntry(){
  document.getElementById('edit-entry-modal').classList.remove('open');
  editIndex=null;
}
async function saveEditEntry(){
  if(editIndex===null)return;
  const amt=parseFloat(document.getElementById('edit-amount-input').value);
  const dateVal=document.getElementById('edit-date-input').value;
  if(!editMonth){showToast('Pick a month','#ffb300');return;}
  if(!editCat){showToast('Pick a category','#ffb300');return;}
  if(!amt||amt<=0){showToast('Enter a valid amount','#ffb300');return;}
  const d=getData();
  const e=d[editIndex];
  if(!e)return;
  e.month=editMonth;e.category=editCat;e.amount=amt;e.date=dateVal;e.tags=[...editTags];
  if(dateVal)e.year=new Date(dateVal).getFullYear();
  saveData(d);
  closeEditEntry();
  renderHistory();renderHome();
  showToast('✏️ Entry updated!');

  if(e.supaId){
    const {error}=await sb.from('transactions').update({
      category:e.category,
      amount:e.amount,
      transaction_date:dateVal?new Date(dateVal).toISOString():new Date().toISOString()
    }).eq('id',e.supaId);
    if(error){
      console.error('Failed to sync edit to cloud:',error);
      showToast('⚠️ Edit saved, but cloud sync failed','#e53935');
    }
  }
}

// ── DEBT / PROFIT ──
function setDebtFilter(f){
  debtFilter=f;
  ['all','active','cleared','debt','profit'].forEach(k=>{
    document.getElementById('df-'+k).classList.toggle('active',k===f);
  });
  renderDebtPage();
}
let selectedDebtUser=null;
let debtUserSearchTimer=null;
function getAllDebtNames(){
  const debts=getDebts();
  return [...new Set(debts.map(d=>d.name).filter(Boolean))];
}
function closeAC(){
  const el=document.getElementById('name-ac-list');
  if(el)el.classList.remove('open');
}
function renderSelectedDebtUser(){
  const el=document.getElementById('selected-debt-user');
  if(!el)return;
  if(!selectedDebtUser){el.style.display='none';el.innerHTML='';return;}
  const label=selectedDebtUser.name||selectedDebtUser.username||'User';
  el.style.display='block';
  el.innerHTML=`<div style="display:flex;align-items:center;gap:10px">
    <div style="width:38px;height:38px;border-radius:50%;overflow:hidden;background:var(--surface);display:flex;align-items:center;justify-content:center;font-weight:800">${selectedDebtUser.avatar?`<img src="${escHtml(selectedDebtUser.avatar)}" style="width:100%;height:100%;object-fit:cover" alt="">`:escHtml(label.charAt(0).toUpperCase())}</div>
    <div style="flex:1"><b>${escHtml(label)}</b><div style="font-size:11px;color:var(--muted)">@${escHtml(selectedDebtUser.username||'')}</div></div>
    <button type="button" class="del-btn" onclick="clearSelectedDebtUser()">✕</button>
  </div>`;
}
function clearSelectedDebtUser(){
  selectedDebtUser=null;
  const inp=document.getElementById('debt-name'); if(inp)inp.value='';
  renderSelectedDebtUser();
}
async function searchDebtUsers(val){
  const list=document.getElementById('name-ac-list');
  if(!list)return;
  const q=String(val||'').trim();
  selectedDebtUser=null; renderSelectedDebtUser();
  if(debtUserSearchTimer)clearTimeout(debtUserSearchTimer);
  if(q.length<2){
    list.classList.remove('open');
    // Still show local previous debt names for quick entry only when there is no user search.
    return;
  }
  list.innerHTML='<div class="ac-item"><span>🔎 Searching users…</span></div>';
  list.classList.add('open');
  debtUserSearchTimer=setTimeout(async()=>{
    try{
      // Existing secure RPC returns only safe public profile fields. The current database
      // function is named by username, but its returned name field lets the UI display full names.
      const {data,error}=await sb.rpc('search_users_by_username',{p_query:q});
      if(error){
        pushErrorLog({message:'Debt user search failed: '+error.message,source:'searchDebtUsers'});
        list.innerHTML='<div class="ac-item"><span style="color:var(--red)">Search unavailable — check Error Logs</span></div>';
        return;
      }
      const me=await resolveSupabaseUserId();
      const rows=(data||[]).filter(u=>u.auth_user_id!==me);
      if(!rows.length){
        list.innerHTML='<div class="ac-item"><span style="opacity:.65">No matching ProjectVault users</span></div>';
        return;
      }
      list.innerHTML=rows.slice(0,12).map(u=>{
        const display=u.name||u.username||'User';
        const avatar=u.avatar||null;
        return `<div class="ac-item" onclick='selectDebtUser(${JSON.stringify({auth_user_id:u.auth_user_id,username:u.username,name:u.name||u.username,avatar}).replace(/'/g,"&#39;")})'>
          <span style="display:flex;align-items:center;gap:9px">
            <span style="width:30px;height:30px;border-radius:50%;overflow:hidden;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700">${avatar?`<img src="${escHtml(avatar)}" style="width:100%;height:100%;object-fit:cover" alt="">`:escHtml(display.charAt(0).toUpperCase())}</span>
            <span><b>${escHtml(display)}</b><br><span style="font-size:11px;opacity:.6">@${escHtml(u.username||'')}</span></span>
          </span>
          <span style="font-size:11px;color:var(--accent)">Select</span>
        </div>`;
      }).join('');
    }catch(e){
      console.error('Debt user search failed:',e);
      list.innerHTML='<div class="ac-item"><span style="color:var(--red)">Search failed</span></div>';
    }
  },250);
}
function selectDebtUser(u){
  selectedDebtUser=u||null;
  const inp=document.getElementById('debt-name');
  if(inp)inp.value=u?(u.name||u.username||''):'';
  closeAC();
  renderSelectedDebtUser();
}
// Backward-compatible local suggestion helper; no longer drives the primary user picker.
function showNameSuggestions(val){searchDebtUsers(val);}
function pickAcName(n){
  const local={name:n,username:n,auth_user_id:null};
  selectDebtUser(local);
}

function selectDebtType(t){
  selDebtType=t;
  document.getElementById('dtype-debt').classList.toggle('sel',t==='debt');
  document.getElementById('dtype-profit').classList.toggle('sel',t==='profit');
}
async function saveDebt(){
  const name=document.getElementById('debt-name').value.trim();
  const amt=parseFloat(document.getElementById('debt-amount').value);
  const dueDate=document.getElementById('debt-due-date').value;
  const interestRate=parseFloat(document.getElementById('debt-interest').value)||0;
  const installments=parseInt(document.getElementById('debt-installments').value)||0;
  if(!selectedDebtUser||!selectedDebtUser.auth_user_id){showToast('Search and select a ProjectVault user','#ffb300');return;}
  if(!amt||amt<=0){showToast('Enter a valid amount','#ffb300');return;}
  if(!selDebtType){showToast('Select type','#ffb300');return;}
  const debtType=selDebtType;
  const ts=Date.now();
  // Preserve the existing local debt model as the user's local view, while adding the
  // cross-account shared-debt record below. The local name is the selected person's
  // display name rather than an arbitrary free-text person.
  const newDebt={name,amount:amt,type:debtType,ts,cleared:false,dueDate:dueDate||null,interestRate:interestRate||null,installments:installments||null,sharedUserId:selectedDebtUser.auth_user_id,sharedUsername:selectedDebtUser.username||null,sharedName:selectedDebtUser.name||name};
  const debts=getDebts(); debts.push(newDebt); saveDebts(debts);
  document.getElementById('debt-name').value='';
  document.getElementById('debt-amount').value='';
  document.getElementById('debt-due-date').value='';
  document.getElementById('debt-interest').value='';
  document.getElementById('debt-installments').value='';
  const selectedUserId=selectedDebtUser.auth_user_id;
  selectedDebtUser=null; renderSelectedDebtUser();
  selDebtType=null;
  document.getElementById('dtype-debt').classList.remove('sel');
  document.getElementById('dtype-profit').classList.remove('sel');
  renderDebtPage();renderHome();

  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined)return;
  // Existing shared_debts is the cross-account source of truth. "I Gave" means current
  // user is lender; "I Borrowed" means current user is borrower.
  const lender_id=debtType==='profit'?userId:selectedUserId;
  const borrower_id=debtType==='profit'?selectedUserId:userId;
  const payload={lender_id,borrower_id,amount:amt,reason:null,due_date:dueDate||null};
  const {data:shared,error:sharedError}=await sb.from('shared_debts').insert(payload).select().single();
  if(sharedError){
    console.error('Failed to sync shared debt:',sharedError);
    pushErrorLog({message:'Shared debt upload failed: '+(sharedError.message||String(sharedError)),source:'saveDebt'});
    showToast(sharedError.code==='42501'?'⚠️ Both users must be connected before sharing money':'⚠️ Shared money sync failed','#ffb300');
    return;
  }
  const d2=getDebts();
  const target=d2.find(x=>x.ts===ts&&x.name===name);
  if(target){target.sharedDebtId=String(shared.id);target.supaId='shared:'+String(shared.id);saveDebts(d2);}
  showToast('✅ Shared debt recorded for both accounts');
}
async function toggleClear(i){
  const debts=getDebts();
  const d=debts[i];
  const wasCleared=d.cleared;
  d.cleared=!wasCleared;
  if(d.cleared&&!wasCleared){
    // Marking as cleared directly (not via the partial-payment box): log whatever
    // balance was still outstanding so it's captured in the combined totals too.
    const remaining=d.amount-(d.repaid||0);
    if(remaining>0.01){
      logDebtCashflow(d,remaining);
      d.repaid=d.amount;
    }
  }
  saveDebts(debts);renderDebtPage();renderHome();
  showToast(d.cleared?'✅ Marked as cleared':'↩️ Marked as active');
  if(d.supaId){
    const{error}=await sb.from('debts').update({cleared:d.cleared,repaid:d.repaid||0}).eq('id',d.supaId);
    if(error)console.error('Failed to sync cleared-status to cloud:',error);
  }
}
function renderDebtPage(){
  const debts=getDebts();
  let filtered=[...debts];
  if(debtFilter==='active')filtered=filtered.filter(d=>!d.cleared);
  else if(debtFilter==='cleared')filtered=filtered.filter(d=>d.cleared);
  else if(debtFilter==='debt')filtered=filtered.filter(d=>d.type==='debt');
  else if(debtFilter==='profit')filtered=filtered.filter(d=>d.type==='profit');
  const sorted=[...filtered].sort((a,b)=>b.ts-a.ts);
  let html='';
  if(!sorted.length)html='<div class="empty"><div class="empty-icon">💸</div><p>No entries.</p></div>';
  sorted.forEach(d=>{
    const oi=debts.indexOf(d);
    const isDebt=d.type==='debt';
    const cleared=d.cleared;
    const repaid=d.repaid||0;
    const remaining=d.amount-repaid;
    const fullyCleared=cleared||(remaining<=0);
    const c=fullyCleared?'var(--muted)':isDebt?'var(--red)':'var(--green)';
    const bg=fullyCleared?'rgba(122,125,153,.1)':isDebt?'rgba(255,101,132,.1)':'rgba(0,208,132,.1)';
    const label=fullyCleared?'✅ Cleared':isDebt?'💸 I Owe':'💰 They Owe Me';
    const badgeClass=fullyCleared?'badge-cleared':isDebt?'badge-debt':'badge-profit';
    const dueDays=d.dueDate?daysDiff(d.dueDate):null;
    let dueLabel='';
    if(d.dueDate&&!fullyCleared){
      if(dueDays<0)dueLabel=`<span style="font-size:10px;color:var(--red)">⚠️ Overdue by ${Math.abs(dueDays)}d</span>`;
      else if(dueDays===0)dueLabel=`<span style="font-size:10px;color:var(--red)">🔴 Due TODAY</span>`;
      else if(dueDays<=2)dueLabel=`<span style="font-size:10px;color:var(--red)">⏰ Due in ${dueDays}d — arrange money!</span>`;
      else if(dueDays<=7)dueLabel=`<span style="font-size:10px;color:var(--amber)">⏰ Due in ${dueDays}d</span>`;
      else dueLabel=`<span style="font-size:10px;color:var(--muted)">📅 ${d.dueDate}</span>`;
    }
    // Interest accrual (simple interest, based on time since entry was created)
    let interestLabel='';
    if(d.interestRate&&!fullyCleared){
      const yearsElapsed=(Date.now()-d.ts)/(1000*60*60*24*365);
      const accrued=remaining*(d.interestRate/100)*yearsElapsed;
      if(accrued>=1){
        interestLabel=`<div style="font-size:10px;color:var(--amber);margin-top:2px">📈 +${fmt(accrued)} interest accrued (${d.interestRate}%/yr) — ${fmt(remaining+accrued)} total</div>`;
      }
    }
    // Repayment history
    const repayLog=(d.repayLog||[]).map(r=>`<div style="font-size:11px;color:var(--muted);margin-top:2px">↩ Returned ${fmt(r.amount)} on ${r.date}</div>`).join('');
    // Installment plan progress
    let installmentLabel='';
    if(d.installments&&d.installments>1){
      const paidCount=(d.repayLog||[]).length;
      const perInstallment=d.amount/d.installments;
      const doneCount=Math.min(paidCount,d.installments);
      installmentLabel=`<div style="font-size:10px;color:var(--accent);margin-top:2px">📋 Installment ${doneCount} of ${d.installments} (${fmt(perInstallment)}/installment)</div>`;
    }
    const repaidBadge=repaid>0&&!fullyCleared?`<span class="remaining-badge">Remaining: ${fmt(remaining)}</span>`:'';
    const sharedBadge=d.sharedUserId?`<span style="font-size:10px;color:var(--accent);margin-left:4px">🤝 Shared</span>`:'';
    const partialControl=!fullyCleared?`<div class="repay-row">
      <input class="repay-inp" type="number" inputmode="decimal" placeholder="Amount returned" id="repay-inp-${oi}"/>
      <button class="repay-btn" onclick="addRepayment(${oi})">↩ Return</button>
    </div>`:'';
    html+=`<div class="entry-row" style="${fullyCleared?'opacity:.55':''}">
      <div class="entry-icon" style="background:${bg};font-size:20px">${fullyCleared?'✅':isDebt?'💸':'💰'}</div>
      <div class="entry-info" style="flex:1">
        <div class="entry-cat">${escHtml(d.name)} ${sharedBadge} ${repaidBadge}</div>
        <div class="entry-meta"><span class="debt-entry-badge ${badgeClass}">${label}</span> ${dueLabel}</div>
        ${interestLabel}
        ${installmentLabel}
        ${repayLog}
        ${partialControl}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-left:8px">
        <span class="entry-amt" style="color:${c}">${fmt(fullyCleared?d.amount:remaining)}</span>
        <button class="clear-btn ${fullyCleared?'active':'inactive'}" onclick="toggleClear(${oi})" style="white-space:nowrap;font-size:10px">${fullyCleared?'Cleared':'Clear'}</button>
        <button class="del-btn" onclick="delDebt(${oi})">✕</button>
      </div>
    </div>`;
  });
  document.getElementById('debt-list').innerHTML=html;
}
async function delDebt(i){
  showConfirmModal({
    icon:'🗑️',
    title:'Delete this entry?',
    message:'This debt/credit record will be permanently removed.',
    confirmText:'Delete',
    onConfirm:async()=>{
      const d=getDebts();
      const removed=d[i];
      d.splice(i,1);saveDebts(d);renderDebtPage();renderHome();showToast('Deleted','#ff6584');
      if(removed&&removed.supaId){
        const{error}=await sb.from('debts').delete().eq('id',removed.supaId);
        if(error)console.error('Failed to delete debt from cloud:',error);
      }
    }
  });
}

// ── DUE DATE ALERTS ──
function checkDueAlerts(){
  const debts=getDebts().filter(d=>!d.cleared&&d.dueDate);
  const upcomingDebts=debts.filter(d=>{
    const dd=daysDiff(d.dueDate);
    return dd!==null&&dd<=2&&dd>=-1; // only 2 days before + same day + 1 day overdue
  }).map(d=>({
    name:d.name,amount:d.amount,daysLeft:daysDiff(d.dueDate),
    info:d.type==='debt'?'You need to pay':'They need to pay you',isRecurring:false
  }));
  // Recurring bills/income due within the same 2-day window, not yet marked paid this cycle
  const upcomingRecurring=getReminders().filter(r=>r.active!==false).map(r=>{
    const daysLeft=daysUntilDue(r);
    const isPaid=!!(r.paid&&r.paid[cycleKeyFor(r)]);
    return{r,daysLeft,isPaid};
  }).filter(x=>!x.isPaid&&x.daysLeft>=0&&x.daysLeft<=2).map(x=>({
    name:x.r.name,amount:x.r.amount,daysLeft:x.daysLeft,
    info:x.r.type==='income'?'Expected to arrive':'Payment due',isRecurring:true
  }));
  const upcoming=[...upcomingDebts,...upcomingRecurring];
  if(!upcoming.length)return;
  let html='';
  upcoming.forEach(item=>{
    const dd=item.daysLeft;
    const urgency=dd<0?`⚠️ Overdue by ${Math.abs(dd)} day(s)`:dd===0?'🔴 Due TODAY':`⏰ Due in ${dd} day(s) — arrange money now!`;
    html+=`<div class="due-alert-item">
      <div class="due-alert-name">${item.isRecurring?'🔁 ':''}${escHtml(item.name)} — ${fmt(item.amount)}</div>
      <div class="due-alert-info">${item.info} · ${urgency}</div>
    </div>`;
  });
  document.getElementById('due-alert-list').innerHTML=html;
  document.getElementById('due-alert-modal').classList.add('open');
  if('Notification' in window && Notification.permission==='granted'){
    upcoming.forEach(item=>{
      const dd=item.daysLeft;
      const msg=dd<0?`OVERDUE: ${item.name} — ${fmt(item.amount)} — arrange money!`:
        dd===0?`DUE TODAY: ${item.name} — ${fmt(item.amount)}`:
        `Due in ${dd}d: ${item.name} — ${fmt(item.amount)} — arrange money now!`;
      new Notification('Expenses Tracker — Payment Reminder',{
        body:msg,
        icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
        tag:'due-'+item.name,
        requireInteraction:true
      });
    });
  }
}
function closeDueAlert(){document.getElementById('due-alert-modal').classList.remove('open');}

// ── MONTH MODAL ──
function showMonthPicker(){
  let h=`<div class="sel-btn${filterMonth==='All'?' sel':''}" onclick="setFilter('All')">All</div>`;
  MONTHS.forEach(m=>{h+=`<div class="sel-btn${filterMonth===m?' sel':''}" onclick="setFilter('${m}')">${m.slice(0,3)}</div>`;});
  document.getElementById('modal-month-grid').innerHTML=h;
  document.getElementById('month-modal').classList.add('open');
}
document.getElementById('month-modal').addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');});
document.getElementById('cat-delete-modal').addEventListener('click',function(e){if(e.target===this)closeCatDeleteModal();});

// ── MANAGE ──
function renderManage(){
  const cats=getCats();let html='';
  if(!cats.length)html='<div style="color:var(--muted);font-size:13px;padding:6px 0">No categories.</div>';
  cats.forEach((c,i)=>{
    const cl=color(c);
    const isCustom=!!getCatColors()[c];
    html+=`<div class="manage-row"><span style="font-size:20px;width:32px;text-align:center">${emoji(c)}</span><span style="flex:1;font-size:15px">${escHtml(c)}</span>${isCustom?`<button onclick="resetCatColor('${escJsAttr(c)}')" title="Reset to default color" style="background:none;border:none;color:var(--muted);font-size:10px;margin-right:4px;cursor:pointer;">↺</button>`:''}<input type="color" value="${cl}" onchange="setCatColor('${escJsAttr(c)}',this.value)" title="Choose a custom color for ${escHtml(c)}" style="width:20px;height:20px;border:none;border-radius:50%;padding:0;margin-right:8px;cursor:pointer;background:none;"/><button class="del-btn" onclick="deleteCat(${i})">✕</button></div>`;
  });
  document.getElementById('manage-cat-list').innerHTML=html;
  const catBudgets=getCatBudgets();
  document.getElementById('cat-budget-list').innerHTML=cats.map(c=>`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:16px;width:24px;text-align:center">${emoji(c)}</span>
      <span style="flex:1;font-size:13px">${escHtml(c)}</span>
      <div style="position:relative;width:110px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px">₹</span>
        <input type="number" class="ti" value="${catBudgets[c]||''}" placeholder="No limit" onchange="setCatBudget('${escJsAttr(c)}',this.value)" style="padding:7px 7px 7px 22px;font-size:12px;width:100%"/>
      </div>
    </div>`).join('');
  document.getElementById('budget-limit-input').value=getBudgetLimit()||'';
  const rolloverCb=document.getElementById('rollover-toggle');
  if(rolloverCb)rolloverCb.checked=getRolloverEnabled();
  const statusNote=document.getElementById('emailjs-status-note');
  if(statusNote)statusNote.innerHTML=EMAILJS_READY?' <span style="color:var(--green)">✓ Email delivery is configured.</span>':' <span style="color:var(--amber)">⚠ Email delivery not set up yet — see EMAILJS_SETUP.md.</span>';
  // Load profile fields
  const users=getUsers();
  const profile=users[CU];
  const require2faCb=document.getElementById('require2fa-toggle');
  if(require2faCb&&profile)require2faCb.checked=!!profile.require2FA;
  if(profile){
    document.getElementById('edit-name').value=profile.name||'';
    document.getElementById('edit-username').value=CU;
    document.getElementById('edit-email').value=profile.email||'';
    document.getElementById('edit-mobile').value=profile.mobile||'';
    const pavBox=document.getElementById('profile-av-box');
    if(profile.avatar){pavBox.innerHTML=`<img src="${profile.avatar}" alt="Avatar"/>`;}
    else{pavBox.innerHTML=`<span id="profile-av-ph">${(profile.name||'U').charAt(0).toUpperCase()}</span>`;}
    const coverBox=document.getElementById('cover-photo-box');
    if(coverBox){
      if(profile.coverPhoto){coverBox.style.backgroundImage=`url(${profile.coverPhoto})`;const ph=document.getElementById('cover-photo-ph');if(ph)ph.style.display='none';}
      else{coverBox.style.backgroundImage='';const ph=document.getElementById('cover-photo-ph');if(ph)ph.style.display='inline-block';}
    }
    // Profile stats: member since + total entries logged
    const memberSince=profile.createdAt?new Date(profile.createdAt).toLocaleDateString('en-IN',{month:'short',year:'numeric'}):'—';
    const totalEntries=getData().length;
    document.getElementById('profile-stats-row').innerHTML=`
      <div style="flex:1;background:var(--surface2);border-radius:12px;padding:10px;text-align:center;">
        <div style="font-size:15px;font-weight:700">${memberSince}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Member since</div>
      </div>
      <div style="flex:1;background:var(--surface2);border-radius:12px;padding:10px;text-align:center;">
        <div style="font-size:15px;font-weight:700">${totalEntries}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Entries logged</div>
      </div>`;
    renderLoginActivity();
  }
  // Biometric login toggle state
  const bioBtn=document.getElementById('bio-toggle-btn');
  const bioIcon=document.getElementById('bio-toggle-icon');
  const bioTitle=document.getElementById('bio-toggle-title');
  const bioSub=document.getElementById('bio-toggle-sub');
  if(!window.PublicKeyCredential){
    bioBtn.style.opacity='.5';bioBtn.onclick=null;
    bioIcon.textContent='🚫';bioTitle.textContent='Biometric Login Unavailable';
    bioSub.textContent='Not supported on this browser/device';
  } else if(profile&&profile.bioCredId){
    bioIcon.textContent='✅';bioTitle.textContent='Disable Biometric Login';
    bioSub.textContent='Currently enabled on this device';
  } else {
    bioIcon.textContent='👆';bioTitle.textContent='Enable Biometric Login';
    bioSub.textContent='Use fingerprint / Face unlock instead of password';
  }
  // Show admin sections
  const isAdmin=!!(profile&&profile.isAdmin);
  const supportCardMng = document.getElementById("support-user-card");
  if(supportCardMng){
    supportCardMng.style.display = isAdmin ? "none" : "block";
  }
  document.getElementById('admin-members-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-messages-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-stats-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-errorlogs-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-announcement-section').style.display=isAdmin?'block':'none';
  document.getElementById('admin-database-section').style.display=isAdmin?'block':'none';
  if(isAdmin){renderMembers();renderAdminMessages();renderAdminStats();renderErrorLogs();updateAnnouncementSyncNote();}
  document.getElementById('admin-update-section').style.display=isAdmin?'block':'none';
  checkForAppUpdates();
  checkAnnouncement();
  loadSupportTickets();
}
function addCategory(){
  const inp=document.getElementById('new-cat-input'),val=inp.value.trim();
  if(!val)return;
  const cats=getCats();
  if(cats.includes(val)){showToast('Already exists!','#ffb300');return;}
  cats.push(val);saveCats(cats);inp.value='';renderManage();renderCatGrid();showToast('Category added!');
}
// ── CATEGORY BUG B6 FIX ──
// Previously deleteCat() only asked a raw confirm() and then always spliced the category out,
// even when historical transactions still referenced it by name — leaving those records with a
// category that no longer exists in Manage → Categories (an "orphaned" category on old data).
// That silently breaks category-based reports/filters/budgets for anything already logged.
// Now: categories with zero historical usage delete immediately (nothing at risk). Categories
// still in use are never blindly removed — the user must explicitly move those transactions to
// another category first, via the themed modal below, so reports stay meaningful.
let _catDeleteIndex=null,_catDeleteName=null,_catDeleteReassignTo=null;
function deleteCat(i){
  const cats=getCats();
  const cat=cats[i];
  if(cat===undefined)return;
  const usageCount=getData().filter(e=>e.category===cat).length;
  if(usageCount===0){
    showConfirmModal({
      icon:'🗑️',
      title:'Delete category?',
      message:`Delete "${cat}"? It has no transactions yet, so nothing else will be affected.`,
      confirmText:'Delete',
      onConfirm:()=>performCatDelete(i,cat)
    });
    return;
  }
  if(cats.length<2){
    showAlertModal({error:true,icon:'🚫',title:'Can\u2019t delete this category',message:`"${cat}" is your only category and it's used by ${usageCount} transaction${usageCount===1?'':'s'}. Add another category first so those transactions have somewhere to go.`});
    return;
  }
  openCatDeleteModal(i,cat,usageCount);
}
function openCatDeleteModal(i,cat,usageCount){
  _catDeleteIndex=i;_catDeleteName=cat;_catDeleteReassignTo=null;
  const cats=getCats().filter(c=>c!==cat);
  const otherCats=cats.length?cats:['Other'];
  document.getElementById('cat-delete-msg').textContent=
    `"${cat}" is used by ${usageCount} historical transaction${usageCount===1?'':'s'}. To keep your reports and totals accurate, choose a category to move ${usageCount===1?'it':'them'} to before deleting "${cat}".`;
  const defaultTarget=otherCats.includes('Other')?'Other':otherCats[0];
  _catDeleteReassignTo=defaultTarget;
  document.getElementById('cat-delete-reassign-grid').innerHTML=otherCats.map(c=>
    `<div class="sel-btn${c===defaultTarget?' sel':''}" onclick="selectCatReassignTarget('${escJsAttr(c)}')">${emoji(c)} ${escHtml(c)}</div>`
  ).join('');
  document.getElementById('cat-delete-modal').classList.add('open');
}
function selectCatReassignTarget(c){
  _catDeleteReassignTo=c;
  document.querySelectorAll('#cat-delete-reassign-grid .sel-btn').forEach(el=>{
    el.classList.toggle('sel',el.textContent.trim().endsWith(c));
  });
}
function closeCatDeleteModal(){
  document.getElementById('cat-delete-modal').classList.remove('open');
  _catDeleteIndex=null;_catDeleteName=null;_catDeleteReassignTo=null;
}
function confirmCatReassignDelete(){
  if(_catDeleteIndex===null||!_catDeleteReassignTo)return;
  const i=_catDeleteIndex,cat=_catDeleteName,target=_catDeleteReassignTo;
  const data=getData();
  let moved=0;
  data.forEach(e=>{if(e.category===cat){e.category=target;moved++;}});
  saveData(data);
  closeCatDeleteModal();
  performCatDelete(i,cat);
  showToast(`✅ Moved ${moved} transaction${moved===1?'':'s'} to "${target}" and removed "${cat}"`,'#00d084');
  renderHome();renderHistory();
}
function performCatDelete(i,cat){
  const cats=getCats();
  const idx=cats.indexOf(cat);
  if(idx===-1)return;
  cats.splice(idx,1);
  saveCats(cats);
  // Clean up per-category settings so they don't linger for a category that no longer exists.
  const catBudgets=getCatBudgets();
  if(catBudgets[cat]!==undefined){delete catBudgets[cat];localStorage.setItem(uKey('catBudgets'),JSON.stringify(catBudgets));deleteCategoryBudget(cat);}
  const catColors=getCatColors();
  if(catColors[cat]!==undefined){delete catColors[cat];saveCatColors(catColors);}
  renderManage();renderCatGrid();
  showToast('Removed','#ff6584');
}

// ── CONTACT ADMIN / CUSTOMER SERVICE ──
async function sendAdminMessage(){

  const msg = document.getElementById("admin-msg-inp").value.trim();

  if(!msg){
    showToast("Please enter a message.");
    return;
  }

  const userId = await resolveSupabaseUserId();

  if(userId===null||userId===undefined){
    showToast("Unable to identify your account.");
    return;
  }

  const { error } = await sb
    .from("support_messages")
    .insert({
      user_id: userId,
      username: CU,
      message: msg,
      status: "Open"
    });

  if(error){
    console.error(error);
    showToast("Failed to send message.");
    return;
  }

  document.getElementById("admin-msg-inp").value = "";

  showToast("Message sent successfully ✅");

}
async function deleteAdminMessage(id){
  showConfirmModal({
    icon:'🗑️',
    title:'Delete this ticket?',
    message:'This support ticket will be permanently removed and cannot be recovered.',
    confirmText:'Delete',
    onConfirm:async()=>{
      try{
        const{error}=await sb.from('support_messages').delete().eq('id',id);
        if(error)throw error;
      }catch(e){console.error('Failed to delete message:',e);showToast('Failed to delete message','#e53935');return;}
      renderAdminMessages();
    }
  });
}
async function setTicketStatus(id,status){
  try{
    const{error}=await sb.from('support_messages').update({status}).eq('id',id);
    if(error)throw error;
  }catch(e){console.error('Failed to update message status:',e);showToast('Failed to update status','#e53935');return;}
  showToast(`Marked as ${status}`);
  renderAdminMessages();
}
// Kept for backwards compatibility with any old bindings — now just resolves the ticket.
async function markMessageRead(id){ await setTicketStatus(id,'Resolved'); }
async function sendTicketReply(id){
  const ta=document.getElementById('reply-inp-'+id);
  if(!ta)return;
  const text=ta.value.trim();
  if(!text){showToast('Type a reply first','#ffb300');return;}
  try{
    const{error}=await sb.from('support_messages').update({admin_reply:text,status:'In Progress'}).eq('id',id);
    if(error)throw error;
  }catch(e){
    console.error('Failed to send reply:',e);
    pushErrorLog({message:'Failed to save admin_reply — the "admin_reply" column may not exist yet on support_messages. '+(e&&e.message?e.message:String(e)),source:'sendTicketReply'});
    showToast('Failed to send reply — see Error Logs','#e53935');
    return;
  }
  showToast('💬 Reply sent to user');
  renderAdminMessages();
}
async function renderAdminMessages(){
  const el=document.getElementById('admin-messages-list');
  if(!el)return;
  el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:6px 0">Loading messages…</div>';
  let msgs=[];
  try{
    const{data,error}=await sb.from('support_messages').select('*').order('created_at',{ascending:false});
    if(error)throw error;
    msgs=data||[];
  }catch(e){
    console.error('Failed to load support messages:',e);
    el.innerHTML='<div style="color:var(--red);font-size:13px;padding:6px 0">Could not load messages from the cloud. Check the console / Error Logs for details.</div>';
    pushErrorLog({message:'Failed to load support_messages: '+(e&&e.message?e.message:String(e)),source:'renderAdminMessages'});
    return;
  }
  if(!msgs.length){el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:6px 0">No messages yet.</div>';return;}
  const statusColor={Open:'#ffb300','In Progress':'#2196f3',Resolved:'#00d084'};
  el.innerHTML=msgs.map(m=>{
    const dt=m.created_at?new Date(m.created_at).toLocaleString('en-IN'):'';
    const status=m.status||'Open';
    const sc=statusColor[status]||'#7a7d99';
    const subjectLine=m.subject?`<div style="font-size:13px;font-weight:700;margin-bottom:2px">${escHtml(m.subject)}</div>`:'';
    const meta=[m.category,m.priority?m.priority+' priority':null].filter(Boolean).map(escHtml).join(' · ');
    return `<div style="background:var(--surface2);border-radius:12px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px">
        <span style="font-size:13px;font-weight:700">${escHtml(m.username||'Unknown')}</span>
        <span style="font-size:10px;font-weight:700;color:${sc};background:${sc}22;padding:2px 8px;border-radius:8px;white-space:nowrap">${status}</span>
      </div>
      ${subjectLine}
      ${meta?`<div style="font-size:11px;color:var(--muted);margin-bottom:6px">${meta}</div>`:''}
      <div style="font-size:13px;line-height:1.6;margin-bottom:4px">${escHtml(m.message||'')}</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px">${dt}</div>
      ${m.admin_reply?`<div style="padding:8px 10px;background:rgba(108,99,255,.12);border-radius:10px;font-size:12px;line-height:1.6;margin-bottom:8px"><b style="color:var(--accent)">Your reply:</b> ${escHtml(m.admin_reply)}</div>`:''}
      <textarea id="reply-inp-${m.id}" class="ti" placeholder="Write a reply to the user..." style="width:100%;min-height:50px;resize:none;line-height:1.5;font-size:12px;margin-bottom:6px">${m.admin_reply?'':''}</textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="pill-btn" style="font-size:11px" onclick="sendTicketReply(${m.id})">💬 Send Reply</button>
        ${status!=='In Progress'?`<button class="pill-btn" style="font-size:11px" onclick="setTicketStatus(${m.id},'In Progress')">🔄 In Progress</button>`:''}
        ${status!=='Resolved'?`<button class="pill-btn" style="font-size:11px" onclick="setTicketStatus(${m.id},'Resolved')">✓ Resolve</button>`:`<button class="pill-btn" style="font-size:11px" onclick="setTicketStatus(${m.id},'Open')">↩ Reopen</button>`}
        <button class="pill-btn" style="font-size:11px;color:var(--red)" onclick="deleteAdminMessage(${m.id})">🗑 Delete</button>
      </div>
    </div>`;
  }).join('');
}

// ── ADMIN: MEMBERS LIST / USER MANAGEMENT ──
async function renderMembers(){
  const summaryEl=document.getElementById('admin-members-summary');
  const listEl=document.getElementById('admin-members-list');
  const noteEl=document.getElementById('admin-members-note');
  if(!summaryEl||!listEl)return;
  const localUsers=getUsers();
  let entries=Object.entries(localUsers);
  let source='local';
  // Try to pull the real, full user registry from Supabase so admin actions apply platform-wide,
  // not just to accounts that happen to have been created on this specific browser/device.
  try{
    const{data,error}=await sb.from('users').select('*');
    if(!error&&Array.isArray(data)&&data.length){
      source='cloud';
      entries=data.map(row=>[row.username,{
        name:row.name||row.username,isAdmin:!!row.is_admin,createdAt:row.created_at?new Date(row.created_at).getTime():0,
        email:row.email||null,mobile:row.mobile||null,_cloudId:row.id
      }]);
    }
  }catch(e){/* fall back to local-only view below */}
  if(noteEl)noteEl.textContent=source==='cloud'
    ?'Showing all registered users across every device (live from Supabase).'
    :'Cloud user list unavailable right now — showing accounts created on this device/browser only.';
  const nonAdminCount=entries.filter(([u,p])=>!p.isAdmin).length;
  let totalIncomeAll=0,totalExpenseAll=0;
  entries.forEach(([u])=>{
    try{
      const d=JSON.parse(localStorage.getItem('exp_'+u+'_data')||'[]');
      totalIncomeAll+=d.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
      totalExpenseAll+=d.filter(e=>e.type!=='income').reduce((s,e)=>s+e.amount,0);
    }catch(e){}
  });
  summaryEl.innerHTML=`${entries.length} total account${entries.length===1?'':'s'} · ${nonAdminCount} member${nonAdminCount===1?'':'s'} (excl. admin)<br><span style="color:var(--green)">${fmt(totalIncomeAll)} income</span> · <span style="color:var(--red)">${fmt(totalExpenseAll)} expenses</span> tracked on this device across known accounts`;
  if(!entries.length){listEl.innerHTML='<div style="color:var(--muted);font-size:13px;padding:6px 0">No members yet.</div>';return;}
  const sorted=entries.sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  listEl.innerHTML=sorted.map(([u,p])=>{
    let entryCount=0,debtCount=0;
    try{entryCount=JSON.parse(localStorage.getItem('exp_'+u+'_data')||'[]').length;}catch(e){}
    try{debtCount=JSON.parse(localStorage.getItem('exp_'+u+'_debts')||'[]').length;}catch(e){}
    const joined=p.createdAt?new Date(p.createdAt).toLocaleDateString('en-IN'):'—';
    const isSelf=u===CU;
    return `<div class="entry-row" style="flex-wrap:wrap">
      <div class="entry-icon" style="background:${p.isAdmin?'rgba(108,99,255,.2)':'rgba(0,208,132,.15)'}">${p.isAdmin?'👑':escHtml((p.name||u).charAt(0).toUpperCase())}</div>
      <div class="entry-info">
        <div class="entry-cat">${escHtml(p.name||u)} ${p.isAdmin?'<span class="debt-entry-badge badge-debt" style="font-size:10px">Admin</span>':''}</div>
        <div class="entry-meta">@${escHtml(u)} · ${entryCount} entries · ${debtCount} debt records · joined ${joined}</div>
      </div>
      ${isSelf?'':`<div style="display:flex;gap:6px;width:100%;margin-top:8px">
        <button class="pill-btn" style="font-size:11px" onclick="toggleAdminRole('${escJsAttr(u)}')">${p.isAdmin?'⬇ Remove Admin':'⬆ Make Admin'}</button>
        <button class="pill-btn" style="font-size:11px;color:var(--red)" onclick="deleteUserAccount('${escJsAttr(u)}')">🗑 Delete Account</button>
      </div>`}
    </div>`;
  }).join('');
}
async function toggleAdminRole(u){
  // BUG FIX: this used to flip the LOCAL cached isAdmin flag first (trusting whatever this
  // browser last saw, not the real current cloud value) and only best-effort try{}catch{}'d the
  // cloud write — a failed cloud update would silently leave this device showing the opposite
  // admin state from what Supabase (and RLS) actually enforces. Also had no guard against an
  // admin removing their own admin status, which could self-lock-out of the admin panel.
  if(!u||u===CU)return;
  try{
    const {data:row,error:readError}=await sb.from('users').select('is_admin').eq('username',u).maybeSingle();
    if(readError)throw readError;
    if(!row){showToast('User not found in cloud','#ffb300');return;}
    const next=!row.is_admin;
    const {error:updateError}=await sb.from('users').update({is_admin:next}).eq('username',u);
    if(updateError)throw updateError;
    const users=getUsers();
    if(users[u]){users[u].isAdmin=next;saveUsers(users);}
    showToast(next?`👑 ${u} is now an admin`:`${u} is no longer an admin`);
    renderMembers();
  }catch(e){
    console.error('Could not sync admin role to cloud:',e);
    showToast('Failed to update admin role — check Error Logs','#e53935');
    pushErrorLog({message:'Admin role update failed: '+(e&&e.message?e.message:String(e)),source:'toggleAdminRole'});
  }
}
async function deleteUserAccount(u){
  showConfirmModal({
    icon:'🗑️',
    title:'Delete this account?',
    message:`Permanently delete @${u}'s account? This removes their profile and cannot be undone. Their historical transactions/debts already synced to Supabase are not automatically erased.`,
    confirmText:'Delete Account',
    requireTypedText:u,
    inputLabel:`Type "${u}" to confirm`,
    onConfirm:async()=>{
      const users=getUsers();
      delete users[u];
      saveUsers(users);
      try{localStorage.removeItem('exp_'+u+'_data');localStorage.removeItem('exp_'+u+'_debts');localStorage.removeItem('exp_'+u+'_cats');}catch(e){}
      try{const{error}=await sb.from('users').delete().eq('username',u);if(error)throw error;}
      catch(e){console.error('Could not delete user from cloud:',e);showToast('Deleted locally — cloud deletion failed, check Error Logs','#ffb300');pushErrorLog({message:'Failed to delete user from Supabase: '+(e&&e.message?e.message:String(e)),source:'deleteUserAccount'});renderMembers();return;}
      showToast(`🗑 @${u} deleted`,'#ff6584');
      renderMembers();
    }
  });
}

// ── ADMIN: APPLICATION STATISTICS ──
async function renderAdminStats(){
  const srcEl=document.getElementById('admin-stats-source');
  const gridEl=document.getElementById('admin-stats-grid');
  if(!srcEl||!gridEl)return;
  srcEl.textContent='Loading…';
  const stat=(label,value,color)=>`<div style="background:var(--surface2);border-radius:12px;padding:12px"><div style="font-size:20px;font-weight:800;color:${color||'var(--text)'}">${value}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${label}</div></div>`;
  let userCount=Object.keys(getUsers()).length;
  let txnCount=null,debtCount=null,msgCount=null,cloudOk=false;
  try{
    const [uRes,tRes,dRes,mRes]=await Promise.all([
      sb.from('users').select('*',{count:'exact',head:true}),
      sb.from('transactions').select('*',{count:'exact',head:true}),
      sb.from('debts').select('*',{count:'exact',head:true}),
      sb.from('support_messages').select('*',{count:'exact',head:true})
    ]);
    if(typeof uRes.count==='number'){userCount=uRes.count;cloudOk=true;}
    if(typeof tRes.count==='number')txnCount=tRes.count;
    if(typeof dRes.count==='number')debtCount=dRes.count;
    if(typeof mRes.count==='number')msgCount=mRes.count;
  }catch(e){console.error('Admin stats cloud fetch failed:',e);}
  srcEl.textContent=cloudOk?'Live counts from Supabase.':'Cloud counts unavailable — showing what this device can see.';
  gridEl.innerHTML=
    stat('Total Users',userCount,'var(--accent)')+
    stat('Transactions',txnCount!==null?txnCount:'—','var(--green)')+
    stat('Debt Records',debtCount!==null?debtCount:'—','var(--red)')+
    stat('Support Messages',msgCount!==null?msgCount:'—','#ffb300')+
    stat('Error Logs (device)',getErrorLogs().length,'#ff6584')+
    stat('App Version',APP_VERSION,'var(--text)');
}

// ── ADMIN: ERROR LOGS ──
function renderErrorLogs(){
  const el=document.getElementById('admin-errorlogs-list');
  if(!el)return;
  const logs=getErrorLogs();
  if(!logs.length){el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:6px 0">No errors captured on this device. 🎉</div>';return;}
  el.innerHTML=logs.map(l=>{
    const dt=new Date(l.ts).toLocaleString('en-IN');
    return `<div style="background:var(--surface2);border-radius:12px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:12px;font-weight:700;color:var(--red)">${escHtml(l.message||'Error')}</span><span style="font-size:10px;color:var(--muted);white-space:nowrap">${dt}</span></div>
      ${l.source?`<div style="font-size:11px;color:var(--muted);margin-top:4px">${escHtml(l.source)}${l.user?' · @'+escHtml(l.user):''}</div>`:''}
    </div>`;
  }).join('');
}

// ── ADMIN: ANNOUNCEMENTS (broadcast banner, independent of version release notes) ──
// Prefers a shared Supabase table so the announcement reaches every device; if the table doesn't
// exist yet or the query fails, falls back to this-device-only storage so the feature still works.
// To get full cross-device delivery, create this table once in Supabase:
//   create table announcements (id bigint generated by default as identity primary key,
//     text text not null, created_at timestamptz default now());
async function getAnnouncement(){
  try{
    const{data,error}=await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(!error&&data)return {text:data.text,id:String(data.id),ts:data.created_at?new Date(data.created_at).getTime():Date.now(),cloud:true};
  }catch(e){/* table may not exist yet — fall back below */}
  const local=JSON.parse(localStorage.getItem('exp_announcement')||'null');
  return local;
}
async function pushAnnouncement(){
  const text=document.getElementById('announcement-text-inp').value.trim();
  if(!text){showToast('Type an announcement first','#ffb300');return;}
  let cloudOk=false;
  try{
    const{error}=await sb.from('announcements').insert({text});
    if(!error)cloudOk=true;
  }catch(e){/* fall back to local-only below */}
  localStorage.setItem('exp_announcement',JSON.stringify({text,id:'local-'+Date.now(),ts:Date.now(),cloud:cloudOk}));
  document.getElementById('announcement-text-inp').value='';
  showToast(cloudOk?'📣 Announcement published to all users!':'📣 Saved on this device (cloud table not set up — see code comment)','#00d084');
  updateAnnouncementSyncNote();
  checkAnnouncement();
}
async function updateAnnouncementSyncNote(){
  const el=document.getElementById('admin-announcement-sync-note');
  if(!el)return;
  const notice=await getAnnouncement();
  if(!notice){el.textContent='';return;}
  el.textContent=notice.cloud
    ?`✅ Last announcement synced to all devices via Supabase (${new Date(notice.ts).toLocaleString('en-IN')}).`
    :`⚠️ Last announcement is saved on this device only — create the "announcements" table in Supabase (see comment above pushAnnouncement in the code) to broadcast to everyone.`;
}
async function checkAnnouncement(){
  const notice=await getAnnouncement();
  const banner=document.getElementById('announcement-banner');
  if(!banner)return;
  if(!notice){banner.style.display='none';return;}
  const dismissedId=localStorage.getItem('exp_announcement_dismissed');
  if(dismissedId===notice.id){banner.style.display='none';return;}
  document.getElementById('announcement-text').textContent=notice.text;
  banner.style.display='flex';
}
async function dismissAnnouncement(){
  const notice=await getAnnouncement();
  if(notice)localStorage.setItem('exp_announcement_dismissed',notice.id);
  document.getElementById('announcement-banner').style.display='none';
}

// ── ADMIN: DATABASE MANAGEMENT ──
async function exportFullDatabaseBackup(){
  showToast('Preparing backup…');
  const backup={exportedAt:new Date().toISOString(),appVersion:APP_VERSION,tables:{}};
  const tables=['users','transactions','debts','reminders','support_messages','announcements'];
  for(const t of tables){
    try{
      const{data,error}=await sb.from(t).select('*');
      backup.tables[t]=error?{error:error.message}:data;
    }catch(e){
      backup.tables[t]={error:String(e&&e.message?e.message:e)};
    }
  }
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`projectvault-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);
  showToast('☁️ Backup downloaded!','#00d084');
}

// ── UPDATE NOTIFICATION ──
// ── UPDATE NOTIFICATION ──
// This writes to the same Supabase `app_updates` table that checkForAppUpdates() reads from —
// previously the publish form saved to localStorage only while the actual banner logic read from
// Supabase, so a published update never reached anyone, including the admin's other devices.
async function pushUpdateNotice(){
  const title=document.getElementById('update-title-inp').value.trim();
  const ver=document.getElementById('update-version-inp').value.trim();
  const notes=document.getElementById('update-notes-inp').value.trim();
  if(!ver||!notes){showToast('Fill version and notes','#ffb300');return;}
  try{
    // Retire older updates so the newest one is unambiguously "the" active update.
    await sb.from('app_updates').update({active:false}).eq('active',true);
    const{error}=await sb.from('app_updates').insert({
      title:title||`Version ${ver}`,version:ver,description:notes,active:true
    });
    if(error)throw error;
  }catch(e){
    console.error('Failed to publish update notice:',e);
    pushErrorLog({message:'Failed to publish update to app_updates: '+(e&&e.message?e.message:String(e)),source:'pushUpdateNotice'});
    showToast('Failed to publish — check Error Logs','#e53935');
    return;
  }
  document.getElementById('update-title-inp').value='';
  document.getElementById('update-version-inp').value='';
  document.getElementById('update-notes-inp').value='';
  showToast('📢 Update notice published to all users!');
  checkForAppUpdates();
}
function showUpdateModal(){

    if(!window.latestUpdate) return;

    const update = window.latestUpdate;

    document.getElementById("update-modal-content").innerHTML = `
        <div style="font-size:18px;font-weight:700;margin-bottom:10px">
            🚀 ${update.title}
        </div>

        <div style="font-size:13px;color:var(--accent);margin-bottom:12px">
            Version ${update.version}
        </div>

        <div style="line-height:1.8;white-space:pre-wrap">
            ${update.description}
        </div>
    `;

    document.getElementById("update-modal").classList.add("open");

    localStorage.setItem("last_seen_update", String(update.id));

    const banner=document.getElementById("update-banner");

    if(banner){
        banner.style.display="none";
    }

}
function dismissUpdate(){
  if(window.latestUpdate)localStorage.setItem('last_seen_update',String(window.latestUpdate.id));
  document.getElementById('update-modal').classList.remove('open');
  document.getElementById('update-banner').style.display='none';
  showToast('✅ Marked as read');
}
document.getElementById('update-modal').addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');});
document.getElementById('forgotpw-modal').addEventListener('click',function(e){if(e.target===this)closeForgotPwModal();});

// ── CHANGE PASSWORD ──
function showChangePwModal(){document.getElementById('changepw-modal').classList.add('open');}
async function doChangePw(){
  const old=document.getElementById('cp-old').value;
  const nw=document.getElementById('cp-new').value;
  const conf=document.getElementById('cp-conf').value;
  const err=document.getElementById('cp-err');
  const users=getUsers();
  if(!users[CU]||!users[CU].email){err.textContent='User not found.';return;}
  if(!old){err.textContent='Enter your current password.';return;}
  if(nw.length<4){err.textContent='New password must be at least 4 characters.';return;}
  if(nw!==conf){err.textContent='Passwords do not match.';return;}

  err.textContent='';

  // Verify the current password the same way login does — via Supabase Auth — rather than
  // comparing against a locally cached hash. A live session already exists at this point,
  // but re-checking the old password server-side prevents someone who found an unlocked
  // device (or a stale local cache) from changing the password without knowing it.
  const { error: reauthError } = await sb.auth.signInWithPassword({
    email: users[CU].email,
    password: old
  });
  if (reauthError) {
    err.textContent = 'Current password is wrong.';
    return;
  }

  const { error } = await sb.auth.updateUser({ password: nw });
  if (error) {
    console.error('Failed to update password in Supabase Auth:', error);
    err.textContent = error.message || 'Could not update password — check your connection and try again.';
    return;
  }

  // No password hash is written to public.users or localStorage. Supabase Auth remains
  // the sole credential authority.
  document.getElementById('changepw-modal').classList.remove('open');
  ['cp-old','cp-new','cp-conf'].forEach(id=>document.getElementById(id).value='');
  err.textContent='';
  showToast('🔑 Password updated!');
}
document.getElementById('changepw-modal').addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');});

// ── EXPORT ──
function exportCSV(){
  let csv='Month,Category,Amount,Type,Date,PayMode,Year\n';
  getData().forEach(e=>{csv+=`${e.month},${e.category},${e.amount},${e.type||''},${e.date||''},${e.payMode||''},${e.year||''}\n`;});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='expenses_'+CU+'.csv';a.click();showToast('CSV Downloaded!');
}
function confirmClear(){
  showConfirmModal({
    icon:'🗑️',
    title:'Delete ALL expenses?',
    // BUG FIX: this used to only clear the local copy — the cloud `transactions` table (fed by
    // the Android app and any manual entries synced from this web app) was left untouched, so a
    // "cleared" account would repopulate on the next sync from whatever was still in Supabase.
    message:'This permanently removes every income and expense entry on this account, including anything already synced to the cloud. This cannot be undone.',
    confirmText:'Delete All',
    requireTypedText:'DELETE',
    inputLabel:'Type DELETE to confirm',
    onConfirm:async()=>{
      saveData([]);
      renderHome();
      const userId=await resolveSupabaseUserId();
      if(userId){
        const {error}=await sb.from('transactions').delete().eq('user_id',userId);
        if(error){
          console.error('Cloud clear failed:',error);
          pushErrorLog({message:'Cloud clear-all failed: '+(error.message||String(error)),source:'confirmClear'});
          showToast('⚠️ Local data cleared, but cloud delete failed — check Error Logs','#ffb300');
          return;
        }
      }
      showToast('Cleared','#ff6584');
    }
  });
}
function exportAccount(){
  if(!CU){showToast('Not logged in','#ffb300');return;}
  const users=getUsers();
  // BUG FIX: v1 only exported data/cats/debts — reminders, budget limit, rollover setting,
  // per-category budgets/colors, and appearance prefs were silently dropped from every backup,
  // so restoring from one on a new device lost all of that even though it exists locally.
  const payload={
    version:2,username:CU,profile:users[CU],data:getData(),cats:getCats(),debts:getDebts(),
    reminders:getReminders(),budget:getBudgetLimit(),rollover:getRolloverEnabled(),
    catBudgets:getCatBudgets(),catColors:getCatColors(),
    appearance:{theme:getTheme(),textSize:getTextSize(),contrast:getContrastMode()}
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='expenses_backup_'+CU+'.json';a.click();showToast('✅ Backup downloaded!');
}
function importAccount(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const p=JSON.parse(ev.target.result);
      if(!p.username||!p.profile||!p.data){showToast('Invalid backup file','#ff6584');return;}
      const users=getUsers();users[p.username]=p.profile;saveUsers(users);
      localStorage.setItem('exp_'+p.username+'_data',JSON.stringify(p.data||[]));
      localStorage.setItem('exp_'+p.username+'_cats',JSON.stringify(p.cats||[]));
      localStorage.setItem('exp_'+p.username+'_debts',JSON.stringify(p.debts||[]));
      // BUG FIX: restore the fields added to the export payload above (v2) — a v1 backup
      // simply won't have them, hence the ||[] / ||{} / ||0 fallbacks below.
      localStorage.setItem('exp_'+p.username+'_reminders',JSON.stringify(p.reminders||[]));
      localStorage.setItem('exp_'+p.username+'_budget',String(p.budget||0));
      localStorage.setItem('exp_'+p.username+'_rollover',p.rollover?'on':'off');
      localStorage.setItem('exp_'+p.username+'_catBudgets',JSON.stringify(p.catBudgets||{}));
      localStorage.setItem('exp_'+p.username+'_catColors',JSON.stringify(p.catColors||{}));
      if(p.appearance){
        if(p.appearance.theme)localStorage.setItem('exp_theme',p.appearance.theme);
        if(p.appearance.textSize)localStorage.setItem('exp_textsize',p.appearance.textSize);
        localStorage.setItem('exp_contrast',p.appearance.contrast?'on':'off');
      }
      showToast('✅ Account imported! Login with: '+p.username);
    }catch(err){showToast('Error reading file','#ff6584');}
  };
  r.readAsText(f);e.target.value='';
}

// ── PROFILE EDIT ──
let pendingCover=null;
function handleCoverPhoto(e){
  const f=e.target.files[0];if(!f)return;
  if(f.size>3*1024*1024){showToast('Image too large (max 3MB)','#ffb300');return;}
  const r=new FileReader();
  r.onload=ev=>{
    pendingCover=ev.target.result;
    const box=document.getElementById('cover-photo-box');
    box.style.backgroundImage=`url(${pendingCover})`;
    const ph=document.getElementById('cover-photo-ph');
    if(ph)ph.style.display='none';
  };
  r.readAsDataURL(f);
}
function handleProfileAvatar(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>openCropModal(ev.target.result);
  r.readAsDataURL(f);
}
  async function sendSupportMessage(){

    const category = document.getElementById("support-category").value;
    const priority = document.getElementById("support-priority").value;
    const subject = document.getElementById("support-subject").value.trim();
    const message = document.getElementById("support-message").value.trim();

    if(subject===""){
        showToast("Please enter a subject","#ff9800");
        return;
    }

    if(message===""){
        showToast("Please describe your issue","#ff9800");
        return;
    }

    const userId = await resolveSupabaseUserId();

    if(userId===null||userId===undefined){
        showToast("Unable to identify your account","#f44336");
        return;
    }

    const {error}=await sb
    .from("support_messages")
    .insert([{
        user_id:userId,
        username:CU,
        category:category,
        priority:priority,
        subject:subject,
        message:message,
        status:"Open",
        created_at:new Date().toISOString()
    }]);

    if(error){
    console.error("Support Ticket Error:", error);
    pushErrorLog({message:'Failed to submit support ticket: '+(error&&error.message?error.message:JSON.stringify(error)),source:'submitSupportTicket'});
    showToast("Failed to submit ticket — please try again");
    return;
}

    document.getElementById("support-subject").value="";
    document.getElementById("support-message").value="";

    showToast("Support ticket submitted successfully!","#00c853");

    loadSupportTickets();
}
// Renders the current user's own tickets — this function was being called after every submission
// but never actually existed, so tickets silently vanished from the user's own view even though
// they were reaching the database fine.
function getSeenReplies(){try{return JSON.parse(localStorage.getItem('exp_seen_replies_'+CU)||'[]');}catch(e){return [];}}
function saveSeenReplies(arr){localStorage.setItem('exp_seen_replies_'+CU,JSON.stringify(arr));}
async function checkUnreadReplies(){
  const badge=document.getElementById('manage-reply-badge');
  if(!badge)return;
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined){badge.style.display='none';return;}
  try{
    const{data,error}=await sb.from('support_messages').select('id,admin_reply').eq('user_id',userId).not('admin_reply','is',null);
    if(error)throw error;
    const seen=getSeenReplies();
    const unread=(data||[]).filter(t=>!seen.includes(t.id));
    badge.style.display=unread.length?'block':'none';
  }catch(e){badge.style.display='none';}
}
async function loadSupportTickets(){
  const el=document.getElementById('support-ticket-list');
  if(!el)return;
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined){el.innerHTML='<div style="font-size:12px;color:var(--muted)">Log in to see your tickets.</div>';return;}
  el.innerHTML='<div style="font-size:12px;color:var(--muted)">Loading your tickets…</div>';
  try{
    const{data,error}=await sb.from('support_messages').select('*').eq('user_id',userId).order('created_at',{ascending:false});
    if(error)throw error;
    if(!data||!data.length){el.innerHTML='<div style="font-size:12px;color:var(--muted)">No support tickets yet.</div>';return;}
    // Viewing this list marks any admin replies on it as seen — clears the Manage tab badge.
    const seen=getSeenReplies();
    const repliedIds=data.filter(t=>t.admin_reply).map(t=>t.id);
    saveSeenReplies([...new Set([...seen,...repliedIds])]);
    checkUnreadReplies();
    const statusColor={Open:'#ffb300','In Progress':'#2196f3',Resolved:'#00d084'};
    el.innerHTML=data.map(t=>{
      const dt=t.created_at?new Date(t.created_at).toLocaleString('en-IN'):'';
      const sc=statusColor[t.status]||'#7a7d99';
      return `<div style="background:var(--surface2);border-radius:12px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">${escHtml(t.subject||'(no subject)')}</span>
          <span style="font-size:10px;font-weight:700;color:${sc};background:${sc}22;padding:2px 8px;border-radius:8px;white-space:nowrap">${escHtml(t.status||'Open')}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">${escHtml(t.category||'')}${t.priority?' · '+escHtml(t.priority)+' priority':''} · ${dt}</div>
        <div style="font-size:13px;line-height:1.6">${escHtml(t.message||'')}</div>
        ${t.admin_reply?`<div style="margin-top:8px;padding:8px 10px;background:rgba(108,99,255,.12);border-radius:10px;font-size:12px;line-height:1.6"><b style="color:var(--accent)">Admin reply:</b> ${escHtml(t.admin_reply)}</div>`:''}
      </div>`;
    }).join('');
  }catch(e){
    console.error('Failed to load support tickets:',e);
    el.innerHTML='<div style="font-size:12px;color:var(--red)">Could not load your tickets right now.</div>';
    pushErrorLog({message:'Failed to load user support tickets: '+(e&&e.message?e.message:String(e)),source:'loadSupportTickets'});
  }
}
  async function checkForAppUpdates(){

    try{

        const { data, error } = await sb
            .from("app_updates")
            .select("*")
            .eq("active", true)
            .order("created_at",{ascending:false})
            .limit(1)
            .single();

        if(error || !data){
            return;
        }

        const lastSeen = localStorage.getItem("last_seen_update");

        if(lastSeen === String(data.id)){
            return;
        }

        const banner=document.getElementById("update-banner");

        if(banner){

            banner.style.display="flex";

            document.getElementById("update-version-text").textContent=
                `${data.version} • ${data.title}`;

        }

        window.latestUpdate=data;

    }catch(err){

        console.error("Update Check Error:",err);

    }

}
async function saveProfile(){
  const name=document.getElementById('edit-name').value.trim();
  const email=document.getElementById('edit-email').value.trim().toLowerCase();
  const mobile=document.getElementById('edit-mobile').value.trim();
  if(!name){showToast('Name cannot be empty','#ffb300');return;}
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){showToast('Enter a valid email address','#ffb300');return;}
  if(mobile&&!/^\d{10}$/.test(mobile)){showToast('Enter a valid 10-digit mobile','#ffb300');return;}
  const users=getUsers();
  if(!users[CU])return;
  if(Object.entries(users).some(([uname,x])=>uname!==CU&&x.email&&x.email===email)){showToast('Another account already uses this email','#ffb300');return;}
  users[CU].name=name;
  users[CU].email=email;
  users[CU].mobile=mobile||null;
  // If a new avatar was cropped after opening manage tab
  if(pendingAv){users[CU].avatar=pendingAv;pendingAv=null;}
  if(pendingCover){users[CU].coverPhoto=pendingCover;pendingCover=null;}
  saveUsers(users);
  // Sync profile to Supabase
try{
  const userId = await resolveSupabaseUserId();

  if(userId){
    const { data, error } = await sb
      .from('users')
    .update({
  name: users[CU].name,
  email: users[CU].email,
  mobile: users[CU].mobile,
  avatar: users[CU].avatar || null,
  cover_photo: users[CU].coverPhoto || null
})
      .eq('auth_user_id', userId)
      .select();

    if(error){
      console.error("Profile Update Error:", error);
    }
  }
}catch(err){
  console.error("Profile Sync Failed:", err);
}
  // Update topbar
  const av=document.getElementById('tb-av');
  if(users[CU].avatar){av.innerHTML=`<img src="${users[CU].avatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}
  else{av.textContent=name.charAt(0).toUpperCase();}
  document.getElementById('tb-hi').textContent='@'+CU;
  syncDrawerProfile(users[CU]);
  showToast('✅ Profile updated!');
}

// ── FORGOT PASSWORD — real Supabase Auth recovery link ──────────────────────────────────
// This replaces the previous custom 6-digit-OTP flow, which generated the OTP in a JS
// variable and then wrote the new password_hash to Supabase as soon as that in-browser
// string comparison passed (documented as B4 in SECURITY_TODO_B4_SERVER_SIDE_OTP.md — a
// devtools user could always call the same write directly, bypassing the check). Supabase
// Auth's resetPasswordForEmail()/updateUser() moves both the token and the password write
// server-side, closing that gap instead of just documenting it.
function showForgotPw(){
  document.getElementById('fp-step1').style.display='block';
  document.getElementById('fp-step2').style.display='none';
  document.getElementById('fp-identifier').value='';
  document.getElementById('fp-err').textContent='';
  document.getElementById('fp-title').textContent='🔑 Forgot Password';
  document.getElementById('forgotpw-modal').classList.add('open');
}
function closeForgotPwModal(){
  document.getElementById('forgotpw-modal').classList.remove('open');
}
// Resolve a login identifier (email or 10-digit mobile) to the email Supabase Auth needs.
// Username is deliberately NOT accepted here (unlike login) — resetPasswordForEmail() needs
// a real email address, and guessing one from a username would defeat the point.
async function findAuthEmailByIdentifier(idRaw){
  const id=idRaw.trim().toLowerCase();
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) return id; // already an email — use directly
  const{data,error}=await sb.from('users').select('email').eq('mobile',idRaw.trim()).maybeSingle();
  if(error){console.error('Forgot-password lookup failed:',error);return null;}
  return (data&&data.email)||null;
}
async function sendPasswordResetLink(){
  const idVal=document.getElementById('fp-identifier').value.trim();
  const err=document.getElementById('fp-err');
  err.textContent='';
  if(!idVal){err.textContent='Enter your registered mobile number or email.';return;}

  const btn=document.getElementById('fp-send-btn');
  if(btn&&btn.disabled)return;
  setBtnLoading('fp-send-btn',true,'Sending…');
  try{
    const email=await findAuthEmailByIdentifier(idVal);
    // Same response either way, whether or not an account was found — avoids leaking
    // account existence through the UI (same anti-enumeration intent as the old flow).
    if(email){
      // redirectTo is built from the page the app is actually running on, so this never
      // points at a dev-only localhost URL regardless of where it's deployed (GitHub
      // Pages, a custom domain, etc). This origin+path MUST also be added to Supabase's
      // Auth → URL Configuration → Redirect URLs allow-list, or Supabase will reject it.
      const redirectTo=window.location.origin+window.location.pathname;
      const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
      if(error)console.error('resetPasswordForEmail failed:',error); // still show generic success below
    }
    document.getElementById('forgotpw-modal').classList.remove('open');
    showAlertModal({
      icon:'📧',
      title:'Check your email',
      message:'If an account matches what you entered, a password reset link is on its way. Open it on this device to set a new password.'
    });
  } finally {
    setBtnLoading('fp-send-btn',false);
  }
}
// completePasswordReset() only ever runs while a Supabase "recovery" session is active —
// i.e. after the user has clicked the emailed link and landed back here (see the
// PASSWORD_RECOVERY handler on sb.auth.onAuthStateChange near the top of this file, which
// is what opens fp-step2 in the first place). There is no OTP left to check client-side.
async function completePasswordReset(){
  const nw=document.getElementById('fp-newpw').value;
  const conf=document.getElementById('fp-confpw').value;
  const err=document.getElementById('fp-err2');
  err.textContent='';
  if(nw.length<4){err.textContent='Password must be at least 4 characters.';return;}
  if(nw!==conf){err.textContent='Passwords do not match.';return;}

  const btn=document.getElementById('fp-reset-btn');
  if(btn&&btn.disabled)return;
  setBtnLoading('fp-reset-btn',true,'Resetting…');
  try{
    const{error}=await sb.auth.updateUser({password:nw});
    if(error){
      console.error('Password reset failed in Supabase Auth:',error);
      err.textContent=error.message||'Could not reset password — check your connection and try again.';
      return;
    }
    document.getElementById('forgotpw-modal').classList.remove('open');
    showToast('✅ Password reset! Please log in.');
    // The recovery session Supabase just used isn't the same as a normal login session for
    // this app's purposes (CU was never set, profile was never loaded) — sign out cleanly
    // so the person lands on a normal login form rather than a half-initialized app state.
    await sb.auth.signOut();
  } finally {
    setBtnLoading('fp-reset-btn',false);
  }
}

// ── MONTHLY STATEMENT EMAIL ──
// NOTE ON LIMITATIONS: this is a client-only (serverless) PWA. There is no server running at midnight
// to fire this automatically the instant a month ends. Instead, the statement for a month is generated
// and emailed the next time the app is opened after that month has ended (checked once per login/startApp).
// For a statement that fires exactly at month-end with zero app interaction, a small backend/cron job
// (or a scheduled Cloud Function) would be required — this client-side version covers the vast majority
// of real usage, since most people open a finance app at least once every few days.
function monthKey(monthName,year){return year+'-'+String(MONTHS.indexOf(monthName)).padStart(2,'0');}
function getPreviousMonthInfo(ref){
  const d=ref?new Date(ref):new Date();
  d.setDate(1); d.setMonth(d.getMonth()-1);
  return {monthName:MONTHS[d.getMonth()], year:d.getFullYear()};
}
// Builds up to 6 separate category "slots" (cat_line_1..cat_line_6) instead of one joined string.
// This avoids relying on ANY special whitespace/line-break CSS being supported by the email
// client (Gmail strips a lot of CSS, especially in its mobile app) — each category becomes its
// own genuinely separate HTML row in the template, so there's nothing that can silently fail.
function buildCategoryBreakdownSlots(periodData){
  const bycat={};
  periodData.filter(e=>e.type!=='income').forEach(e=>{bycat[e.category]=(bycat[e.category]||0)+e.amount;});
  const sorted=Object.entries(bycat).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const lines=sorted.map(([cat,amt])=>`${emoji(cat)} ${cat}: ${fmt(amt)}`);
  const slots={};
  for(let i=0;i<6;i++)slots['cat_line_'+(i+1)]=lines[i]||'';
  if(!lines.length)slots.cat_line_1='No expenses logged this period.';
  return slots;
}
function computeStatsForMonth(data,monthName,year){
  const rows=data.filter(e=>e.month===monthName&&e.year===year);
  const totalIncome=rows.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
  const totalExpense=rows.filter(e=>e.type!=='income').reduce((s,e)=>s+e.amount,0);
  const mIdx=MONTHS.indexOf(monthName);
  const daysInMonth=new Date(year,mIdx+1,0).getDate();
  const avgDaily=totalExpense/daysInMonth;
  return {totalIncome,totalExpense,avgDaily,count:rows.length,daysInMonth};
}
function computeYearStats(data,year){
  const rows=data.filter(e=>e.year===year&&e.type!=='income');
  const totalExpense=rows.reduce((s,e)=>s+e.amount,0);
  const monthsWithData=new Set(rows.map(e=>e.month)).size||1;
  return {totalExpense,avgMonthly:totalExpense/monthsWithData,monthsWithData};
}
let _statementCheckInFlight=false;
function isoWeekKey(d){
  const onejan=new Date(d.getFullYear(),0,1);
  const week=Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7);
  return d.getFullYear()+'-w'+week;
}
// Weekly digest — sent once per week (checked on Monday app-opens), covering the previous 7 days.
// Reuses the monthly statement template (EmailJS free plan only allows 2 templates), with the
// "month" field relabeled to a date-range so it reads naturally in the email.
async function checkAndSendWeeklyDigest(){
  if(!CU)return;
  if(new Date().getDay()!==1)return; // only check on Mondays
  const users=getUsers();
  const acc=users[CU];
  if(!acc||!acc.email||acc.isAdmin)return;
  const now=new Date();
  const wk=isoWeekKey(now);
  if(acc.lastWeeklyDigestSent===wk)return;
  const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()-1);
  const weekStart=new Date(now);weekStart.setDate(weekStart.getDate()-7);
  const data=getData().filter(e=>e.date&&e.date>=weekStart.toISOString().split('T')[0]&&e.date<=weekEnd.toISOString().split('T')[0]);
  if(!data.length)return;
  const totalIncome=data.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
  const totalExpense=data.filter(e=>e.type!=='income').reduce((s,e)=>s+e.amount,0);
  const rangeLabel='Week of '+weekStart.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+'–'+weekEnd.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  const yStats=computeYearStats(getData(),now.getFullYear());
  const catBreakdown=buildCategoryBreakdownSlots(data);
  const result=await sendStatementEmail(acc,CU,rangeLabel,now.getFullYear(),{totalIncome,totalExpense,avgDaily:(totalExpense/7)},yStats,catBreakdown);
  if(result.ok){acc.lastWeeklyDigestSent=wk;saveUsers(users);}
}
// Annual summary — sent once per year (checked in January), covering the previous calendar year.
async function checkAndSendAnnualSummary(){
  if(!CU)return;
  if(new Date().getMonth()!==0)return; // only check in January
  const users=getUsers();
  const acc=users[CU];
  if(!acc||!acc.email||acc.isAdmin)return;
  const prevYear=new Date().getFullYear()-1;
  if(acc.lastAnnualSummarySent===prevYear)return;
  const allData=getData();
  const yStats=computeYearStats(allData,prevYear);
  const yearIncome=allData.filter(e=>e.type==='income'&&e.year===prevYear).reduce((s,e)=>s+e.amount,0);
  if(yStats.totalExpense===0&&yearIncome===0)return;
  const yearData=allData.filter(e=>e.year===prevYear);
  const catBreakdown=buildCategoryBreakdownSlots(yearData);
  const result=await sendStatementEmail(acc,CU,'Full Year Summary',prevYear,{totalIncome:yearIncome,totalExpense:yStats.totalExpense,avgDaily:yStats.totalExpense/365},yStats,catBreakdown);
  if(result.ok){acc.lastAnnualSummarySent=prevYear;saveUsers(users);}
}
async function checkAndSendMonthlyStatement(){
  if(!CU)return;
  if(_statementCheckInFlight)return; // prevent a second concurrent check (e.g. quick lock/unlock) from double-sending
  const users=getUsers();
  const acc=users[CU];
  if(!acc||!acc.email||acc.isAdmin)return;
  const {monthName,year}=getPreviousMonthInfo();
  const key=monthKey(monthName,year);
  if(acc.lastStatementSent===key)return; // already sent for that month
  const data=getData();
  const mStats=computeStatsForMonth(data,monthName,year);
  if(mStats.count===0)return; // nothing to report — don't send an empty statement
  const yStats=computeYearStats(data,year);
  _statementCheckInFlight=true;
  try{
    const periodData=data.filter(e=>e.month===monthName&&e.year===year);
    const catBreakdown=buildCategoryBreakdownSlots(periodData);
    const result=await sendStatementEmail(acc,CU,monthName,year,mStats,yStats,catBreakdown);
    if(result.ok){
      acc.lastStatementSent=key;
      saveUsers(users);
    } else if(result.reason==='send_failed'){
      console.warn('Monthly statement auto-send failed, will retry next app open:', result.detail);
    }
  } finally {
    _statementCheckInFlight=false;
  }
}
async function sendStatementEmail(acc,uname,monthName,year,mStats,yStats,catSlots){
  const remaining=(mStats.totalIncome||0)-(mStats.totalExpense||0);
  const slots=catSlots||{cat_line_1:'',cat_line_2:'',cat_line_3:'',cat_line_4:'',cat_line_5:'',cat_line_6:''};
  return await sendEmailViaEmailJS(EMAILJS_CONFIG.statementTemplateId,{
    to_email:acc.email,
    to_name:acc.name||uname,
    username:uname,
    mobile:acc.mobile||'Not provided',
    month:monthName,
    year:String(year),
    total_income:fmt(mStats.totalIncome),
    total_expense:fmt(mStats.totalExpense),
    remaining_balance:fmt(remaining),
    avg_daily_spend:fmt(mStats.avgDaily),
    year_total_expense:fmt(yStats.totalExpense),
    year_avg_monthly_spend:fmt(yStats.avgMonthly),
    ...slots,
    app_name:'Expenses Tracker',
    brand_name:'ProjectVault',
    logo_url:APP_LOGO_URL
  });
}
// Manual "send now" for testing — uses the most recently completed month regardless of the send-once guard.
async function sendTestStatementNow(){
  if(!CU)return;
  const users=getUsers();
  const acc=users[CU];
  if(!acc.email){showToast('Add an email in your profile first','#ffb300');return;}
  const {monthName,year}=getPreviousMonthInfo();
  const data=getData();
  const mStats=computeStatsForMonth(data,monthName,year);
  const yStats=computeYearStats(data,year);
  if(mStats.count===0){showToast('No data for '+monthName+' '+year+' to report','#ffb300');return;}
  showToast('Sending test statement…','#6c63ff');
  const periodData=data.filter(e=>e.month===monthName&&e.year===year);
  const catBreakdown=buildCategoryBreakdownSlots(periodData);
  const result=await sendStatementEmail(acc,CU,monthName,year,mStats,yStats,catBreakdown);
  if(result.ok){
    showToast('📧 Statement emailed to '+acc.email,'#00d084');
  } else if(result.reason==='send_failed'){
    showToast('⚠️ Email send failed: '+result.detail,'#ff6584');
  } else {
    showToast('⚠️ EmailJS not configured yet — see EMAILJS_SETUP.md','#ff6584');
  }
}

// ── MONTHLY REMINDERS ──
function getReminders(){return JSON.parse(localStorage.getItem(uKey('reminders'))||'[]');}
function saveReminders(r){localStorage.setItem(uKey('reminders'),JSON.stringify(r));}
  async function uploadReminder(r){
  if(!CU) return;
  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;
  const { error } = await sb.from('reminders').upsert({
    id: r.id,
    user_id: userId,
    name: r.name,
    amount: r.amount,
    day: r.day,
    month: r.month,
    type: r.type,
    frequency: r.frequency,
    active: r.active !== false,
    paid: r.paid || {}
  });
  if(error) console.error('Reminder upload failed:', error);
}

async function deleteReminderCloud(id){
  if(!CU) return;
  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;
  const { error } = await sb.from('reminders').delete().eq('id', id).eq('user_id', userId);
  if(error) console.error('Reminder delete failed:', error);
}

async function syncReminders(){
  if(!CU) return;
  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined) return;
  const { data, error } = await sb.from('reminders').select('*').eq('user_id', userId);
  if(error){ console.error('Reminders sync failed:', error); return; }
  const rems = (data||[]).map(row=>({
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    day: row.day,
    month: row.month,
    active: row.active,
    paid: row.paid || {},
    type: row.type,
    frequency: row.frequency
  }));
  saveReminders(rems);
}
function monthKeyNow(){const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1);}
function selectRemType(t){
  selRemType=t;
  document.getElementById('remtype-expense').classList.toggle('sel',t==='expense');
  document.getElementById('remtype-income').classList.toggle('sel',t==='income');
  // Salary/income reminders don't need a per-employer name — the category "Salary" is what shows
  // up in reports, so the name field becomes an optional note (e.g. "Acme Corp") instead.
  document.getElementById('rem-name').placeholder=t==='income'?'e.g. Acme Corp (optional note)':'e.g. PG Rent, EMI, Netflix…';
}
function onRemFreqChange(){
  const freq=document.getElementById('rem-freq').value;
  document.getElementById('rem-day').style.display=(freq==='monthly'||freq==='quarterly')?'block':'none';
  document.getElementById('rem-weekday').style.display=freq==='weekly'?'block':'none';
  document.getElementById('rem-yearly-date').style.display=freq==='yearly'?'block':'none';
}
// Returns a cycle key that uniquely identifies the current due period for a reminder,
// so "already paid this cycle" works correctly regardless of frequency.
function cycleKeyFor(r){
  const d=new Date();
  if(r.frequency==='weekly'){
    const onejan=new Date(d.getFullYear(),0,1);
    const week=Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7);
    return 'w'+d.getFullYear()+'-'+week;
  }
  if(r.frequency==='yearly')return 'y'+d.getFullYear();
  return d.getFullYear()+'-'+(d.getMonth()+1); // monthly & quarterly both use month granularity
}
function isReminderDueToday(r){
  const d=new Date();
  const freq=r.frequency||'monthly';
  if(freq==='weekly')return r.day===d.getDay();
  if(freq==='yearly')return r.day===d.getDate()&&r.month===d.getMonth();
  if(freq==='quarterly'){
    if(r.day!==d.getDate())return false;
    const createdMonth=new Date(r.id).getMonth();
    return ((d.getMonth()-createdMonth)+12)%3===0;
  }
  return r.day===d.getDate(); // monthly
}
function freqLabel(r){
  const freq=r.frequency||'monthly';
  if(freq==='weekly')return['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][r.day]+' every week';
  if(freq==='yearly')return MONTHS[r.month]+' '+r.day+' every year';
  if(freq==='quarterly')return'Day '+r.day+' every 3 months';
  return'Day '+r.day+' every month';
}
function addReminder(){
  const name=document.getElementById('rem-name').value.trim();
  const amount=parseFloat(document.getElementById('rem-amount').value);
  const freq=document.getElementById('rem-freq').value;
  const type=selRemType||'expense';
  let day,month=null;
  if(freq==='weekly'){
    day=parseInt(document.getElementById('rem-weekday').value);
  } else if(freq==='yearly'){
    const dv=document.getElementById('rem-yearly-date').value;
    if(!dv){showToast('Pick a date','#ffb300');return;}
    const dt=new Date(dv+'T00:00:00');
    day=dt.getDate();month=dt.getMonth();
  } else {
    day=parseInt(document.getElementById('rem-day').value);
  }
  if(type==='expense'&&!name){showToast('Enter reminder name','#ffb300');return;}
  if(!amount||amount<=0){showToast('Enter a valid amount','#ffb300');return;}
  if(day===undefined||day===null||isNaN(day)){showToast('Select when this repeats','#ffb300');return;}
  const rems=getReminders();
  rems.push({id:Date.now(),name:name||(type==='income'?'Salary':name),amount,day,month,active:true,paid:{},type,frequency:freq});
  saveReminders(rems);uploadReminder(rems[rems.length-1]).catch(console.error);
  document.getElementById('rem-name').value='';
  document.getElementById('rem-amount').value='';
  document.getElementById('rem-day').value='';
  document.getElementById('rem-yearly-date').value='';
  selectRemType('expense');
  renderReminders();
  showToast(type==='income'?'🔁 Recurring income added!':'🔁 Recurring expense added!');
}
function deleteReminder(id){
  const rems=getReminders().filter(r=>r.id!==id);
 saveReminders(rems);deleteReminderCloud(id).catch(console.error);renderReminders();showToast('Recurring expense removed','#ff6584');
}
// Mark this month's cycle of a recurring expense/income as paid/received — logs a real entry
function markReminderPaid(id){
  const rems=getReminders();
  const r=rems.find(x=>x.id===id);
  if(!r)return;
  if(!r.paid)r.paid={};
  const mk=cycleKeyFor(r);
  if(r.paid[mk])return;
  const now=new Date();
  const data=getData();
  const cats=getCats();
  const isIncome=r.type==='income';
  // Income reminders (salary etc.) always file under the "Salary" category, never under the
  // reminder's name (which may be a company/employer name) — that's what previously made
  // reports show a company name instead of "Salary".
  let matchCat;
  if(isIncome){
    matchCat=cats.find(c=>c.toLowerCase()==='salary')||cats[0]||'Salary';
  } else {
    matchCat=cats.find(c=>c.toLowerCase()===r.name.toLowerCase())||'Rent';
    matchCat=cats.includes(matchCat)?matchCat:(cats[0]||'Other');
  }
  const entry={month:MONTHS[now.getMonth()],category:matchCat,amount:r.amount,type:isIncome?'income':'expense',year:now.getFullYear(),ts:Date.now(),date:now.toISOString().split('T')[0],payMode:null,recurring:true,reminderId:r.id,reminderName:r.name};
  data.push(entry);
  saveData(data);
  uploadLocalTransactionToCloud(entry).then(()=>saveData(data)).catch(console.error);
  r.paid[mk]=entry.ts;
  saveReminders(rems);
  uploadReminder(r).catch(console.error);
  renderReminders();renderHome();renderHistory();
  showToast(isIncome?'✅ '+r.name+' credited for this month!':'✅ '+r.name+' marked paid for this month!');
}
// Undo an accidental "mark as paid" for the current month
function unmarkReminderPaid(id){
  const rems=getReminders();
  const r=rems.find(x=>x.id===id);
  if(!r||!r.paid)return;
  const mk=cycleKeyFor(r);
  const entryTs=r.paid[mk];
  if(entryTs){
    const data=getData();
    const idx=data.findIndex(e=>e.ts===entryTs&&e.reminderId===id);
    if(idx>=0){data.splice(idx,1);saveData(data);}
  }
  delete r.paid[mk];
  saveReminders(rems);
  uploadReminder(r).catch(console.error);
  renderReminders();renderHome();renderHistory();
  showToast('↩️ Marked as unpaid','#ffb300');
}
function renderReminders(){
  const rems=getReminders();
  const el=document.getElementById('reminders-list');
  if(!el)return;
  if(!rems.length){el.innerHTML='<div class="empty" style="padding:20px 10px"><div class="empty-icon" style="font-size:32px;margin-bottom:6px">🔁</div><p>No recurring bills yet.<br>Add rent, EMIs, or subscriptions to get reminders.</p></div>';return;}
  el.innerHTML=rems.map(r=>{
    const mk=cycleKeyFor(r);
    const isPaid=r.paid&&r.paid[mk];
    const isIncome=r.type==='income';
    const isPaused=r.active===false;
    return `
    <div class="rem-row" style="${isPaused?'opacity:.5':''}">
      <span style="font-size:20px">${isPaused?'⏸️':isPaid?'✅':(isIncome?'💰':'🔔')}</span>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">${escHtml(r.name)}${isIncome?' <span style="font-size:10px;color:var(--green);font-weight:700">INCOME</span>':''}${isPaused?' <span style="font-size:10px;color:var(--muted);font-weight:700">PAUSED</span>':''}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px"><span style="color:${isIncome?'var(--green)':'var(--text)'}">${fmt(r.amount)}</span> · ${freqLabel(r)}</div>
      </div>
      ${!isPaused?(isPaid
        ?`<button class="clear-btn active" style="margin-right:4px" onclick="unmarkReminderPaid(${r.id})">${isIncome?'Received ✓':'Paid ✓'}</button>`
        :`<button class="clear-btn inactive" style="margin-right:4px" onclick="markReminderPaid(${r.id})">${isIncome?'Mark Received':'Mark Paid'}</button>`):''}
      <button class="del-btn" style="margin-right:4px;font-size:14px" onclick="toggleReminderActive(${r.id})" title="${isPaused?'Resume':'Pause'}">${isPaused?'▶️':'⏸️'}</button>
      <button class="del-btn" onclick="deleteReminder(${r.id})">✕</button>
    </div>`;
  }).join('');
}
function toggleReminderActive(id){
  const rems=getReminders();
  const r=rems.find(x=>x.id===id);
  if(!r)return;
  r.active=r.active===false?true:false;
  saveReminders(rems);
  uploadReminder(r).catch(console.error);
  renderReminders();
  showToast(r.active?'▶️ Reminder resumed':'⏸️ Reminder paused','#ffb300');
}
// Shows the "Enable reminders" card only when it's actually needed (permission not yet decided)
function maybeShowNotifPrompt(){
  const card=document.getElementById('notif-prompt-card');
  if(!card)return;
  const dismissed=localStorage.getItem(uKey('notifPromptDismissed'));
  if('Notification' in window && Notification.permission==='default' && !dismissed){
    card.style.display='block';
  } else {
    card.style.display='none';
  }
}
// Called directly from a button tap — this is a real user gesture, so the browser will actually
// show its permission dialog (unlike the old timer-based auto-request, which browsers ignore).
function enableNotifications(){
  if(!('Notification' in window)){showToast('Notifications aren\'t supported in this browser','#ffb300');return;}
  Notification.requestPermission().then(perm=>{
    localStorage.setItem(uKey('notifPromptDismissed'),'1');
    document.getElementById('notif-prompt-card').style.display='none';
    if(perm==='granted')showToast('🔔 Reminders enabled!');
    else showToast('Notifications blocked — you can still see reminders as in-app messages','#ffb300');
  });
}
// Manual test — fires an immediate sample reminder alert so you can confirm popups actually work,
// without waiting for a real bill's due date.
function sendTestReminderAlert(){
  showToast('🔔 Test: "Sample Bill" ₹500 — mark it paid on the Add tab','#6c63ff');
  if('Notification' in window && Notification.permission==='granted'){
    new Notification('Expenses Tracker — Test Reminder',{
      body:'📅 This is a test alert. If you see this, reminder popups are working!',
      icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
      tag:'test-reminder'
    });
    showToast('✅ Native popup sent too — check your notifications');
  } else {
    showToast('ℹ️ Native popups are OFF — tap "Enable" on Home to turn them on','#ffb300');
  }
}
function checkReminders(){
  const rems=getReminders().filter(r=>r.active&&isReminderDueToday(r)&&!(r.paid&&r.paid[cycleKeyFor(r)]));
  if(!rems.length)return;
  // Check if already notified today
  const todayKey='rem_notified_'+CU+'_'+new Date().toDateString();
  if(localStorage.getItem(todayKey))return;
  localStorage.setItem(todayKey,'1');
  rems.forEach(r=>{
    const isIncome=r.type==='income';
    showToast('🔔 Due today: '+r.name+' '+fmt(r.amount)+' — mark it '+(isIncome?'received':'paid')+' on the Add tab','#6c63ff');
    if('Notification' in window && Notification.permission==='granted'){
      new Notification('Expenses Tracker — Recurring '+(isIncome?'Income':'Payment')+' Due',{
        body:isIncome?`💰 ${r.name} — ${fmt(r.amount)} is due today! Has it been credited?`:`📅 ${r.name} — ${fmt(r.amount)} is due today! Has it been paid?`,
        icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
        tag:'rem-'+r.id,requireInteraction:true
      });
    }
  });
}

// ── ACHIEVEMENT / MILESTONE CELEBRATIONS (debt cleared, budget goal met, savings milestone) ──
const CEL_MSGS=[
  "You crushed it! Debt-free feels amazing! 💪",
  "Financial freedom, one step at a time! 🚀",
  "That's money back in YOUR pocket! 💰",
  "Zero balance = Zero stress! Keep going! ⭐",
  "You're on fire! Another one bites the dust! 🔥",
  "Debt slayer! Your wallet thanks you! 🏆",
  "Cleared it like a BOSS! 😎",
  "One less thing to worry about. Legend! 🌟"
];
const CEL_EMOJIS=['🎉','🎊','🏆','🌟','🚀','💎','⭐','🎯'];
const BUDGET_CEL_MSGS=[
  "You stayed under budget all month! Discipline pays off! 💪",
  "Budget goal smashed! Your future self says thanks! 🙌",
  "Spending, tamed. That's real self-control! 🎯",
  "Under budget again — you've got this down to a science! ⭐"
];
const SAVINGS_CEL_MSGS=[
  "A new savings milestone, locked in! 🔒",
  "Look at that number grow. Keep stacking! 📈",
  "That's real progress toward your goals! 💎",
  "Future you is going to be very grateful! 🌟"
];
// Renders the shared celebration modal with a color theme + real falling confetti pieces.
function renderCelebration({emoji,title,color,name,msg,btnLabel}){
  document.getElementById('cel-emoji').textContent=emoji;
  const titleEl=document.getElementById('celebrate-title');
  titleEl.textContent=title;titleEl.style.color=color;
  document.getElementById('cel-name').textContent=name;
  document.getElementById('cel-msg').textContent=msg;
  const card=document.getElementById('celebrate-card');
  card.style.borderColor=color;
  card.style.background=`linear-gradient(135deg,${color}33,rgba(108,99,255,.2))`;
  card.style.animation='none';card.offsetHeight;card.style.animation='celBounce .5s cubic-bezier(.34,1.56,.64,1)'; // restart animation on repeat triggers
  const btn=document.getElementById('celebrate-btn');
  btn.style.background=color;btn.textContent=btnLabel||'Woohoo! 🙌';
  const cel=document.getElementById('celebrate-modal');
  cel.style.display='flex';
  haptic('celebrate');
  launchConfetti();
}
// Spawns ~24 real animated confetti pieces (fall + spin) instead of just cycling emoji text —
// reads closer to a proper "3D-ish" celebration burst.
function launchConfetti(){
  const layer=document.getElementById('celebrate-confetti-layer');
  layer.innerHTML='';
  const pieces=['🎉','🎊','✨','⭐','💫','🌟','💎','🎈'];
  for(let i=0;i<24;i++){
    const span=document.createElement('span');
    span.className='confetti-piece';
    span.textContent=pieces[Math.floor(Math.random()*pieces.length)];
    const cx=(Math.random()*280-140).toFixed(0)+'px';
    const cr=(Math.random()>.5?1:-1)*(360+Math.random()*360)+'deg';
    span.style.setProperty('--cx',cx);
    span.style.setProperty('--cr',cr);
    span.style.left=(10+Math.random()*80)+'%';
    span.style.fontSize=(14+Math.random()*14)+'px';
    span.style.animationDelay=(Math.random()*.4)+'s';
    span.style.animationDuration=(1.2+Math.random()*.8)+'s';
    layer.appendChild(span);
  }
  setTimeout(()=>{layer.innerHTML='';},2200);
}
function showCelebration(name, amount){
  const idx=Math.floor(Math.random()*CEL_MSGS.length);
  renderCelebration({
    emoji:CEL_EMOJIS[idx],
    title:'DEBT CLEARED! 🎊',
    color:'var(--green)',
    name:`"${name}" — ${fmt(amount)} fully cleared!`,
    msg:CEL_MSGS[idx]
  });
}
// Once per user per month: celebrate finishing a month at/under the budget limit.
function maybeCelebrateBudgetWin(){
  if(!CU)return;
  const budgetLimit=getBudgetLimit();
  if(!budgetLimit)return;
  const now=new Date();
  if(now.getDate()<25)return; // only worth celebrating once the month is nearly over
  const curMonth=MONTHS[now.getMonth()],curYear=now.getFullYear();
  const key='budgetCel_'+CU+'_'+curYear+'-'+curMonth;
  if(localStorage.getItem(key))return;
  const monthExpense=getData().filter(e=>e.month===curMonth&&e.year===curYear&&e.type!=='income').reduce((s,e)=>s+e.amount,0);
  if(monthExpense>budgetLimit)return;
  localStorage.setItem(key,'1');
  const idx=Math.floor(Math.random()*BUDGET_CEL_MSGS.length);
  renderCelebration({
    emoji:'🎯',
    title:'BUDGET GOAL MET! 🎯',
    color:'var(--accent)',
    name:`${curMonth}: ${fmt(monthExpense)} of ${fmt(budgetLimit)} budget`,
    msg:BUDGET_CEL_MSGS[idx],
    btnLabel:'Amazing! 🙌'
  });
}
// Savings milestones — celebrated the first time your total logged "Savings" crosses each threshold.
const SAVINGS_MILESTONES=[10000,25000,50000,100000,200000,500000,1000000];
function maybeCelebrateSavingsMilestone(){
  if(!CU)return;
  const total=getData().filter(e=>e.category==='Savings'&&e.type!=='income').reduce((s,e)=>s+e.amount,0);
  const key='savingsCelMax_'+CU;
  const prevMax=parseFloat(localStorage.getItem(key)||'0');
  const hit=SAVINGS_MILESTONES.filter(m=>total>=m&&m>prevMax).pop();
  if(hit===undefined)return;
  localStorage.setItem(key,String(hit));
  const idx=Math.floor(Math.random()*SAVINGS_CEL_MSGS.length);
  renderCelebration({
    emoji:'💰',
    title:'SAVINGS MILESTONE! 💰',
    color:'var(--amber)',
    name:`You've saved ${fmt(hit)}+ total!`,
    msg:SAVINGS_CEL_MSGS[idx],
    btnLabel:'Let\'s go! 🚀'
  });
}
function closeCelebration(){
  document.getElementById('celebrate-modal').style.display='none';
}
// ── Daily nudge (item #37) — gentle once-per-day reminder if nothing's been logged today ──
function maybeShowDailyNudge(){
  if(!CU)return;
  const todayKey=new Date().toISOString().split('T')[0];
  const flagKey='dailyNudge_'+CU+'_'+todayKey;
  if(localStorage.getItem(flagKey))return; // already shown today
  const data=getData();
  const loggedToday=data.some(e=>e.date===todayKey);
  if(loggedToday)return;
  localStorage.setItem(flagKey,'1');
  showToast('👋 Nothing logged today yet — add an expense to keep your streak!','#6c63ff');
}

// ── Log a debt repayment/receipt as a real cashflow entry so Home/History totals ──
// ── automatically include it (this is what makes the "combined total" accurate) ──
function logDebtCashflow(d,amt){
  const data=getData();
  const now=new Date();
  const entry={
    month:MONTHS[now.getMonth()],
    category:'Debt',
    amount:amt,
    // Paying off money I owe = expense (cash leaving me). Receiving money owed to me = income.
    type:d.type==='debt'?'expense':'income',
    year:now.getFullYear(),
    ts:Date.now(),
    date:now.toISOString().split('T')[0],
    payMode:null,
    debtLinked:true,
    debtName:d.name
  };
  data.push(entry);
  saveData(data);
  uploadLocalTransactionToCloud(entry).then(()=>saveData(data)).catch(console.error);
  return entry;
}
// ── PATCH addRepayment to validate partial payments, show celebration, and log cashflow ──
async function addRepayment(i){
  const inp=document.getElementById('repay-inp-'+i);
  if(!inp)return;
  const amt=parseFloat(inp.value);
  if(!amt||amt<=0){showToast('Enter a valid amount','#ffb300');return;}
  const debts=getDebts();
  const d=debts[i];
  const remainingBefore=d.amount-(d.repaid||0);
  if(amt>remainingBefore+0.01){
    showToast(`Amount exceeds remaining balance of ${fmt(remainingBefore)}`,'#ffb300');
    return;
  }
  const repaid=(d.repaid||0)+amt;
  d.repaid=repaid;
  if(!d.repayLog)d.repayLog=[];
  d.repayLog.push({amount:amt,date:new Date().toLocaleDateString('en-IN')});
  // Record this partial payment as a normal expense/income entry too
  logDebtCashflow(d,amt);
  inp.value='';
  if(repaid>=d.amount-0.01){
    d.cleared=true;
    saveDebts(debts);renderDebtPage();renderHome();
    showCelebration(d.name, d.amount);
  } else {
    showToast(`↩ Returned ${fmt(amt)} · Remaining ${fmt(d.amount-repaid)}`,'#6c63ff');
    saveDebts(debts);renderDebtPage();renderHome();
  }
  if(d.supaId){
    const{error}=await sb.from('debts').update({repaid:d.repaid,repay_log:d.repayLog,cleared:d.cleared}).eq('id',d.supaId);
    if(error)console.error('Failed to sync repayment to cloud:',error);
  }
}

// ── INIT ENSURE ADMIN handled in INIT block below ──


function showMoneyPersonality(){
  const data=getData();
  if(data.length<3){showToast('Log a few more entries first — need more data for this! 📊','#ffb300');return;}
  const income=data.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
  const expense=data.filter(e=>e.type!=='income').reduce((s,e)=>s+e.amount,0);
  const savingsRate=income>0?(income-expense)/income:(expense>0?-1:0);
  const bycat={};
  data.filter(e=>e.type!=='income').forEach(e=>{bycat[e.category]=(bycat[e.category]||0)+e.amount;});
  const topCat=Object.entries(bycat).sort((a,b)=>b[1]-a[1])[0];
  let persona,personaEmoji,desc;
  if(savingsRate>=0.3){persona='The Vault Keeper';personaEmoji='🏦';desc="You save aggressively and think ahead. Future you is very grateful.";}
  else if(savingsRate>=0.1){persona='The Balanced Planner';personaEmoji='⚖️';desc="You spend on what matters and still tuck money away. Solid instincts.";}
  else if(savingsRate>=0){persona='The Tightrope Walker';personaEmoji='🎪';desc="You're right on the edge of your budget — impressive control, but not much cushion.";}
  else{persona='The Free Spirit';personaEmoji='🦋';desc="You spend more than you earn right now — no judgment, but worth a look at your budget.";}
  const catNote=topCat?` Your biggest weakness: ${emoji(topCat[0])} ${topCat[0]}.`:'';
  renderCelebration({
    emoji:personaEmoji,
    title:persona.toUpperCase()+' '+personaEmoji,
    color:'var(--accent)',
    name:persona,
    msg:desc+catNote,
    btnLabel:'Nice! 😄'
  });
}
function showToast(msg,c){
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.background=c||'var(--green)';t.style.color=c?'#fff':'#052e1c';
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);
}
// ── Undo toast: shows a dismissable "Undo" action for 5s after a destructive change. ──
let _undoAction=null,_undoTimer=null;
function showUndoToast(msg,restoreFn){
  _undoAction=restoreFn;
  document.getElementById('undo-toast-msg').textContent=msg;
  const t=document.getElementById('undo-toast');
  t.classList.add('show');
  clearTimeout(_undoTimer);
  _undoTimer=setTimeout(()=>{t.classList.remove('show');_undoAction=null;},5000);
}
function performUndo(){
  if(_undoAction){_undoAction();_undoAction=null;}
  document.getElementById('undo-toast').classList.remove('show');
  clearTimeout(_undoTimer);
}
// ── Haptic feedback — subtle vibration on supported devices (mostly Android). ──
// ── Silently does nothing on iOS/desktop, which don't support the Vibration API. ──
function haptic(kind){
  if(!navigator.vibrate)return;
  try{
    if(kind==='success')navigator.vibrate([15,40,15]);
    else if(kind==='delete')navigator.vibrate(20);
    else if(kind==='celebrate')navigator.vibrate([20,60,20,60,40]);
    else navigator.vibrate(12);
  }catch(e){/* ignore */}
}

// ── PWA: INSTALLABLE APP ──
let _deferredInstallPrompt=null;
// True if this page is already running as the installed app (Android/desktop Chrome,
// or iOS "Add to Home Screen"), rather than in a normal browser tab.
function isRunningInstalled(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true;
}
function showInstalledState(){
  const card=document.getElementById('install-card');
  const body=document.getElementById('install-card-body');
  const installed=document.getElementById('install-card-installed');
  if(card)card.style.display='block';
  if(body)body.style.display='none';
  if(installed)installed.style.display='flex';
}
window.addEventListener('beforeinstallprompt',(e)=>{
  e.preventDefault();
  _deferredInstallPrompt=e;
  if(isRunningInstalled())return; // safety net: don't offer install if somehow already installed
  const card=document.getElementById('install-card');
  if(card)card.style.display='block';
});
window.addEventListener('appinstalled',()=>{
  _deferredInstallPrompt=null;
  showInstalledState();
  showToast('📲 App installed!');
});
// On load, if we're already running installed, show the confirmation state right away
// instead of leaving the card hidden with no explanation.
if(isRunningInstalled()){
  window.addEventListener('DOMContentLoaded',showInstalledState);
}
function doInstallPWA(){
  if(_deferredInstallPrompt){
    _deferredInstallPrompt.prompt();
    _deferredInstallPrompt.userChoice.then(()=>{_deferredInstallPrompt=null;});
    return;
  }
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(isIOS){
    showToast('On iPhone/iPad: tap Share ⬆️ then "Add to Home Screen"','#6c63ff');
  } else {
    showToast('Open your browser menu and choose "Install App" or "Add to Home Screen"','#6c63ff');
  }
}
// Show the install card on iOS Safari too (no beforeinstallprompt event there)
if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone){
  window.addEventListener('DOMContentLoaded',()=>{
    const card=document.getElementById('install-card');
    if(card)card.style.display='block';
  });
}
  // ── PASSWORD FIELD PANDA TOGGLE — auto-applies to every password input on the page ──
function pandaSvgMarkup(){
  return `<svg width="26" height="26" viewBox="0 0 100 100">
    <circle cx="22" cy="30" r="13" fill="#2b2b2b"/>
    <circle cx="78" cy="30" r="13" fill="#2b2b2b"/>
    <circle cx="50" cy="55" r="36" fill="#ffffff" stroke="#e5e5e5" stroke-width="1"/>
    <ellipse cx="34" cy="46" rx="12" ry="14" fill="#2b2b2b"/>
    <ellipse cx="66" cy="46" rx="12" ry="14" fill="#2b2b2b"/>
    <g class="pw-eyes">
      <circle cx="34" cy="46" r="4" fill="#fff"/>
      <circle cx="66" cy="46" r="4" fill="#fff"/>
    </g>
    <ellipse cx="50" cy="70" rx="6" ry="4.5" fill="#2b2b2b"/>
    <g class="pw-hands">
      <ellipse cx="34" cy="50" rx="14" ry="16" fill="#ffffff" stroke="#e5e5e5" stroke-width="1"/>
      <ellipse cx="66" cy="50" rx="14" ry="16" fill="#ffffff" stroke="#e5e5e5" stroke-width="1"/>
    </g>
  </svg>`;
}
function setupPasswordToggles(){
  document.querySelectorAll('input[type="password"]').forEach(input=>{
    if(input.dataset.pwToggled)return;
    input.dataset.pwToggled='1';
    const wrap=document.createElement('span');
    wrap.style.position='relative';
    wrap.style.display='block';
    input.parentNode.insertBefore(wrap,input);
    wrap.appendChild(input);
    input.style.paddingRight='44px';
    const btn=document.createElement('span');
    btn.className='pw-toggle';
    btn.setAttribute('role','button');
    btn.setAttribute('aria-label','Show or hide password');
    btn.innerHTML=pandaSvgMarkup();
    wrap.appendChild(btn);
    btn.addEventListener('click',()=>{
      const showing=input.type==='text';
      input.type=showing?'password':'text';
      btn.classList.toggle('pw-shown',!showing);
    });
  });
}
setupPasswordToggles();
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{/* offline/file:// — ignore */});
  });
}

// ── INIT ──
// Async because the lock-screen shortcut (skip straight back into a remembered account) is
// only safe to offer if a real Supabase Auth session is still valid — otherwise this would be
// a UI-only "session" that can never actually reach Supabase, which used to be the case when
// this only checked the local exp_session marker.
(async function(){
  try{
    const s=localStorage.getItem('exp_session');
    if(s){
      const u=getUsers();
      const{data:{session}}=await sb.auth.getSession();
      if(session&&u[s]){
        showLockScreen(s);
        return;
      }
      // Local marker says "logged in" but there's no live Supabase session to back it up
      // (expired token, signed out in another tab, cleared cookies, etc). Don't show a lock
      // screen that can never successfully unlock — fall through to a normal login.
      localStorage.removeItem('exp_session');
    }
    document.getElementById('auth-screen').style.display='flex';
  }catch(e){
    console.error('App failed to initialize:',e);
    document.getElementById('auth-screen').style.display='flex';
  }
})();

// ── SPLASH INTRO — shown once per app load, dismisses automatically or on tap ──
// To change the duration, edit SPLASH_DURATION_MS below (currently ~2.8s — kept shorter than a
// literal 10s on purpose since this is an app people open many times a day; a 10s forced wait
// every single time would get frustrating fast. Change to 10000 if you'd still prefer that.)
(function(){
  const SPLASH_DURATION_MS=2800;
  const splash=document.getElementById('splash-screen');
  const bar=document.getElementById('splash-bar');
  if(!splash)return;

  // Dynamic time-of-day greeting, personalized with the saved user's name when we have one.
  const greetEl=document.getElementById('splash-greeting');
  if(greetEl){
    const hr=new Date().getHours();
    const timeGreeting=hr<5?'Still up late':hr<12?'Good morning':hr<17?'Good afternoon':hr<21?'Good evening':'Good night';
    let firstName='';
    try{
      const session=localStorage.getItem('exp_session');
      if(session){
        const users=JSON.parse(localStorage.getItem('exp_users')||'{}');
        const full=(users[session]&&users[session].name)||session;
        firstName=(full||'').split(' ')[0];
      }
    }catch(e){/* first-load or storage unavailable — fall back to a generic greeting */}
    greetEl.textContent=firstName?`${timeGreeting}, ${firstName} 👋`:`${timeGreeting} 👋`;
  }

  // A small rotating set of finance-y motivational lines — one at random per launch.
  const motivEl=document.getElementById('splash-motivation');
  if(motivEl){
    const lines=[
      'Every rupee tracked is a rupee understood.',
      'Small habits, tracked daily, build real wealth.',
      'Your future self will thank you for logging this.',
      'Clarity today, control tomorrow.',
      'Progress, not perfection — one entry at a time.'
    ];
    motivEl.textContent=lines[Math.floor(Math.random()*lines.length)];
  }

  // Cloud sync progress — staged status text that tracks the loading bar, giving an honest
  // sense of what's happening (auth check → local data → cloud sync) rather than a fake percentage.
  const statusEl=document.getElementById('splash-status');
  if(statusEl){
    const hasSession=!!localStorage.getItem('exp_session');
    const stages=hasSession
      ? ['Waking up your vault…','Checking your session…','Syncing with the cloud…','Almost there…']
      : ['Waking up your vault…','Preparing a fresh start…','Almost there…'];
    let stageIdx=0;
    statusEl.textContent=stages[0];
    const stageTimer=setInterval(()=>{
      stageIdx=(stageIdx+1)%stages.length;
      statusEl.textContent=stages[stageIdx];
    },SPLASH_DURATION_MS/stages.length);
    splash._splashStageTimer=stageTimer;
  }

  // Version footer
  const verEl=document.getElementById('splash-version');
  if(verEl){
    try{verEl.textContent=`v${typeof APP_VERSION!=='undefined'?APP_VERSION:'1.0'}`;}catch(e){verEl.textContent='';}
  }

  requestAnimationFrame(()=>{
    bar.style.transition=`width ${SPLASH_DURATION_MS}ms linear`;
    bar.style.width='100%';
  });
  const dismiss=()=>{
    if(splash._splashStageTimer)clearInterval(splash._splashStageTimer);
    splash.style.opacity='0';
    // Whatever screen is underneath (lock screen for returning users, auth screen for new
    // ones, or the dashboard itself) gets a gentle fade+rise so the handoff feels like one
    // continuous motion rather than the splash disappearing to reveal a static screen.
    const lockScreen=document.getElementById('lock-screen');
    const authScreen=document.getElementById('auth-screen');
    const appScreen=document.getElementById('app-screen');
    const revealTarget=
      (lockScreen&&lockScreen.style.display==='flex')?lockScreen:
      (authScreen&&authScreen.style.display==='flex')?authScreen:
      appScreen;
    if(revealTarget){
      revealTarget.classList.add('splash-reveal');
      setTimeout(()=>revealTarget.classList.remove('splash-reveal'),650);
    }
    setTimeout(()=>{splash.style.display='none';},500);
  };
  const timer=setTimeout(dismiss,SPLASH_DURATION_MS);
  splash.addEventListener('click',()=>{clearTimeout(timer);dismiss();});
})();


// ── ANDROID → WEBAPP TRANSACTION SYNC ──
// Pulls in transactions inserted by the Android notification-listener app (PhonePe/GPay/Paytm)
// and keeps them live-synced via Supabase Realtime, without touching the existing manual
// add-expense flow. Each imported entry is tagged with supaId so re-syncing never duplicates it.

async function resolveSupabaseUserId(){
  // The canonical user identity for RLS-protected tables is the Supabase Auth UUID.
  // Never substitute public.users.id (the legacy integer profile key) here.
  if(!CU)return null;
  const{data,error}=await sb.auth.getUser();
  if(error||!data?.user){
    console.error('Could not resolve authenticated Supabase user',error);
    return null;
  }
  return data.user.id;
}

function mapPayApp(paymentApp,paymentMode){
  const map={
    'com.phonepe.app':'PhonePe',
    'com.google.android.apps.nbu.paisa.user':'GPay',
    'net.one97.paytm':'Paytm'
  };
  return map[paymentApp]||paymentMode||'UPI';
}

function mapAndroidCategory(cat){
  const cats=getCats();
  if(cat&&cats.includes(cat))return cat;
  return 'Other';
}

function androidTxnToEntry(txn){
  const raw = txn.transaction_date || txn.created_at;
  const dt = new Date(String(raw).replace(' ','T'));
  const validDt = isNaN(dt.getTime()) ? new Date() : dt;
  const pad2=n=>String(n).padStart(2,'0');
  // Bug fix: the previous `String(raw).split(' ')[0]` assumed `raw` always contains a space
  // (Postgres text style "YYYY-MM-DD HH:MM:SS"). Supabase's JS client actually returns
  // ISO-8601 strings with a 'T' separator and no space (e.g. "2026-08-15T10:30:00+00:00"), so
  // that split silently returned the ENTIRE timestamp string as `date` instead of "YYYY-MM-DD"
  // — breaking anything expecting a plain date (date-input fields, day-level grouping/filters).
  // Deriving it from validDt's local calendar fields is correct for both formats and matches
  // the local-time semantics already used for `month`/`year` below.
  const localDateStr = `${validDt.getFullYear()}-${pad2(validDt.getMonth()+1)}-${pad2(validDt.getDate())}`;

  return {
    month: MONTHS[validDt.getMonth()],
    year: validDt.getFullYear(),
    date: localDateStr,

    category: mapAndroidCategory(txn.category),

    amount: parseFloat(txn.amount) || 0,

    type: txn.type === 'CREDIT' ? 'income' : 'expense',

    ts: validDt.getTime(),

    payMode: mapPayApp(txn.payment_app, txn.payment_mode),

    tags: txn.message
      ? txn.message.split(',').map(t => t.trim()).filter(Boolean)
      : ['Auto-synced'],

    receipt: null,

    supaId: String(txn.id)
  };
}

// BUG FIX: manually-created cashflow entries (recurring reminder payments, debt repayments/
// receipts logged from the web app) were only ever saved to local storage — uploadReminder()
// above syncs the reminder's own definition/paid-map, but never the resulting transaction, and
// logDebtCashflow() below never touched the cloud at all. That meant this data existed on the
// device that created it and nowhere else — the opposite of what every other transaction path
// in this app does. This mirrors the same insert shape Android's TransactionSyncMapper uses.
async function uploadLocalTransactionToCloud(entry){
  if(!CU||!entry||entry.supaId)return null;
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined)return null;
  const payload={
    user_id:userId,amount:Number(entry.amount)||0,
    type:entry.type==='income'?'CREDIT':'DEBIT',
    category:entry.category||'Other',payment_app:'Manual Entry',
    payment_mode:entry.payMode||null,message:(entry.tags||[]).join(', '),
    transaction_date:entry.date?new Date(entry.date+'T00:00:00').toISOString():new Date().toISOString()
  };
  const {data,error}=await sb.from('transactions').insert(payload).select().single();
  if(error){pushErrorLog({message:'Cloud transaction upload failed: '+(error.message||String(error)),source:'uploadLocalTransactionToCloud'});return null;}
  entry.supaId=String(data.id);
  return entry.supaId;
}

// ── SOCIAL MONEY ──
// Wired to connection_requests / connections / blocked_users / shared_debts /
// shared_debt_payments / accept_connection_request() / search_users_by_username()
// (see ProjectVault_social_festival_ads_schema.sql). Every query below relies on
// RLS to enforce "only visible to the participating users" — the client never
// filters by user_id itself except for the initial resolveSupabaseUserId() call,
// matching how the rest of this app already trusts RLS as the real boundary.

// Resolves display names for a batch of auth ids via get_public_profiles() —
// public.users' own RLS only allows reading your own row, so this MUST go
// through that SECURITY DEFINER function; a direct sb.from('users').select()
// here would just come back empty for everyone but yourself.
async function fetchProfileNames(authIds){
  const unique=[...new Set(authIds)].filter(Boolean);
  if(unique.length===0)return {};
  const {data,error}=await sb.rpc('get_public_profiles',{p_auth_ids:unique});
  if(error){
    pushErrorLog({message:'Resolving profile names failed: '+error.message,source:'fetchProfileNames'});
    return {};
  }
  const map={};
  (data||[]).forEach(p=>{map[p.auth_user_id]=p.name||p.username||p.auth_user_id.slice(0,8)+'…';});
  return map;
}

let _socialFriendCache = []; // {authUserId, username, name} — populated by loadConnections(), read by openGiveMoneyForm()

function openSocialModal(){
  document.getElementById('social-modal').classList.add('open');
  showSocialSection('find');
}

function showSocialSection(name){
  ['find','requests','connections','money'].forEach(s=>{
    document.getElementById('social-section-'+s).style.display = s===name ? '' : 'none';
    document.getElementById('social-tab-'+s).style.opacity = s===name ? '1' : '.6';
  });
  if(name==='requests')loadConnectionRequests();
  if(name==='connections')loadConnections();
  if(name==='money')loadMoneySummary();
}

async function searchSocialUsers(){
  const q=document.getElementById('social-search-input').value.trim();
  const results=document.getElementById('social-search-results');
  if(!q){results.innerHTML='';return;}
  results.innerHTML='<div style="opacity:.6">Searching…</div>';
  const {data,error}=await sb.rpc('search_users_by_username',{p_query:q});
  if(error){
    pushErrorLog({message:'Social search failed: '+error.message,source:'searchSocialUsers'});
    results.innerHTML='<div style="color:var(--red)">Search failed — check Error Logs</div>';
    return;
  }
  if(!data||data.length===0){results.innerHTML='<div style="opacity:.6">No users found</div>';return;}
  results.innerHTML=data.map(u=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><b>${u.name||u.username}</b><br><span style="opacity:.6;font-size:12px">@${u.username}</span></div>
      <button class="save-btn" onclick="sendConnectionRequest('${u.auth_user_id}')">Add Friend</button>
    </div>
  `).join('');
}

async function sendConnectionRequest(toUserId){
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined){showToast('Could not resolve your account — try again','#ffb300');return;}
  const {error}=await sb.from('connection_requests').insert({from_user:userId,to_user:toUserId});
  if(error){
    // unique(from_user,to_user) means a repeat click here is expected, not a bug —
    // surface it plainly instead of a generic failure toast.
    const msg = error.code==='23505' ? 'Request already sent' : (error.message||'Could not send request');
    showToast('⚠️ '+msg,'#ffb300');
    return;
  }
  showToast('✅ Friend request sent');
}

async function loadConnectionRequests(){
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined)return;
  const incomingEl=document.getElementById('social-requests-incoming');
  const outgoingEl=document.getElementById('social-requests-outgoing');
  incomingEl.innerHTML='<div style="opacity:.6">Loading…</div>';
  outgoingEl.innerHTML='<div style="opacity:.6">Loading…</div>';

  const [{data:incoming,error:e1},{data:outgoing,error:e2}]=await Promise.all([
    sb.from('connection_requests').select('id,from_user,status,created_at').eq('to_user',userId).eq('status','pending'),
    sb.from('connection_requests').select('id,to_user,status,created_at').eq('from_user',userId).eq('status','pending')
  ]);
  if(e1||e2){pushErrorLog({message:'Loading requests failed: '+((e1||e2).message),source:'loadConnectionRequests'});}

  const idsToResolve=[...(incoming||[]).map(r=>r.from_user),...(outgoing||[]).map(r=>r.to_user)];
  const nameMap=await fetchProfileNames(idsToResolve);
  const nameFor=(authId)=>nameMap[authId]||authId.slice(0,8)+'…';

  incomingEl.innerHTML = (incoming&&incoming.length) ? incoming.map(r=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>${nameFor(r.from_user)}</div>
      <div style="display:flex;gap:6px">
        <button class="save-btn" onclick="acceptConnectionRequest('${r.id}')">Accept</button>
        <button class="save-btn" style="color:var(--red)" onclick="respondConnectionRequest('${r.id}','rejected')">Reject</button>
      </div>
    </div>`).join('') : '<div style="opacity:.6">No incoming requests</div>';

  outgoingEl.innerHTML = (outgoing&&outgoing.length) ? outgoing.map(r=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>${nameFor(r.to_user)} <span style="opacity:.6;font-size:12px">Pending</span></div>
      <button class="save-btn" onclick="respondConnectionRequest('${r.id}','cancelled')">Cancel</button>
    </div>`).join('') : '<div style="opacity:.6">No sent requests</div>';
}

async function acceptConnectionRequest(requestId){
  // accept_connection_request() does both writes (create the connection row +
  // close the request) atomically server-side — see the schema file. Never
  // do this as two separate client calls; a failure between them would leave
  // an accepted request with no actual connection.
  const {error}=await sb.rpc('accept_connection_request',{p_request_id:requestId});
  if(error){
    pushErrorLog({message:'Accept request failed: '+error.message,source:'acceptConnectionRequest'});
    showToast('⚠️ Could not accept — check Error Logs','#e53935');
    return;
  }
  showToast('✅ You are now connected');
  loadConnectionRequests();
}

async function respondConnectionRequest(requestId,status){
  const {error}=await sb.from('connection_requests').update({status,responded_at:new Date().toISOString()}).eq('id',requestId);
  if(error){showToast('⚠️ Action failed','#e53935');return;}
  loadConnectionRequests();
}

async function loadConnections(){
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined)return;
  const el=document.getElementById('social-connections-list');
  el.innerHTML='<div style="opacity:.6">Loading…</div>';
  const {data,error}=await sb.from('connections').select('id,user_a,user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if(error){
    pushErrorLog({message:'Loading connections failed: '+error.message,source:'loadConnections'});
    el.innerHTML='<div style="color:var(--red)">Failed to load — check Error Logs</div>';
    return;
  }
  const friendIds=(data||[]).map(c=>c.user_a===userId?c.user_b:c.user_a);
  const nameMap=await fetchProfileNames(friendIds);
  _socialFriendCache=friendIds.map(id=>({authUserId:id, name: nameMap[id]||id.slice(0,8)+'…'}));
  el.innerHTML = _socialFriendCache.length ? _socialFriendCache.map(f=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>${f.name}</div>
      <button class="save-btn" onclick="openGiveMoneyForm('${f.authUserId}')">Give Money</button>
    </div>`).join('') : '<div style="opacity:.6">No friends yet — find some in the Find Friends tab</div>';
}

function openGiveMoneyForm(friendAuthId){
  const friend=_socialFriendCache.find(f=>f.authUserId===friendAuthId);
  document.getElementById('give-money-title').textContent='Give Money to '+(friend?friend.name:'friend');
  document.getElementById('give-money-modal').dataset.borrowerId=friendAuthId;
  document.getElementById('gm-amount').value='';
  document.getElementById('gm-reason').value='';
  document.getElementById('gm-due').value='';
  document.getElementById('gm-err').textContent='';
  document.getElementById('give-money-modal').classList.add('open');
}

async function submitSharedDebt(){
  const err=document.getElementById('gm-err');
  const amount=parseFloat(document.getElementById('gm-amount').value);
  if(!amount||amount<=0){err.textContent='Enter a valid amount';return;}
  const borrowerId=document.getElementById('give-money-modal').dataset.borrowerId;
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined){err.textContent='Could not resolve your account';return;}
  const payload={
    lender_id:userId, borrower_id:borrowerId, amount,
    reason:document.getElementById('gm-reason').value.trim()||null,
    due_date:document.getElementById('gm-due').value||null
  };
  const {error}=await sb.from('shared_debts').insert(payload);
  if(error){
    // The insert policy requires an existing connections row between the two
    // users — a failure here most often means that row genuinely isn't
    // there yet (e.g. stale friend cache), not a generic error.
    err.textContent = error.code==='42501' ? 'You can only record money with a connected friend' : (error.message||'Failed to record');
    pushErrorLog({message:'Shared debt insert failed: '+error.message,source:'submitSharedDebt'});
    return;
  }
  document.getElementById('give-money-modal').classList.remove('open');
  showToast('✅ Recorded');
  loadMoneySummary();
}

async function loadMoneySummary(){
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined)return;
  const summaryEl=document.getElementById('social-money-summary');
  const lentEl=document.getElementById('social-money-lent');
  const borrowedEl=document.getElementById('social-money-borrowed');
  summaryEl.innerHTML='<div style="opacity:.6">Loading…</div>';

  // shared_debts_with_computed_status derives remaining/effective_status
  // (including overdue) at query time — never trust a locally-cached
  // "remaining" value for this, since it must match exactly what the other
  // participant sees.
  const [{data:lent,error:e1},{data:borrowed,error:e2}]=await Promise.all([
    sb.from('shared_debts_with_computed_status').select('*').eq('lender_id',userId).order('created_at',{ascending:false}),
    sb.from('shared_debts_with_computed_status').select('*').eq('borrower_id',userId).order('created_at',{ascending:false})
  ]);
  if(e1||e2){
    pushErrorLog({message:'Loading money summary failed: '+((e1||e2).message),source:'loadMoneySummary'});
    summaryEl.innerHTML='<div style="color:var(--red)">Failed to load — check Error Logs</div>';
    return;
  }

  const owedToMe=(lent||[]).filter(d=>d.effective_status!=='cancelled').reduce((s,d)=>s+Number(d.remaining),0);
  const iOwe=(borrowed||[]).filter(d=>d.effective_status!=='cancelled').reduce((s,d)=>s+Number(d.remaining),0);
  const net=owedToMe-iOwe;
  summaryEl.innerHTML=`
    <div style="font-size:13px;opacity:.7">Owed to me: ₹${owedToMe.toFixed(2)} &nbsp;|&nbsp; I owe: ₹${iOwe.toFixed(2)}</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px;color:${net>=0?'var(--green)':'var(--red)'}">Net ${net>=0?'+':''}₹${net.toFixed(2)}</div>
  `;

  const statusLabel=s=>({pending:'Pending',partially_paid:'Partially Paid',paid:'Paid',overdue:'Overdue',cancelled:'Cancelled'}[s]||s);
  const idsToResolve=[...(lent||[]).map(d=>d.borrower_id),...(borrowed||[]).map(d=>d.lender_id)];
  const nameMap=await fetchProfileNames(idsToResolve);
  const nameFor=(authId)=>nameMap[authId]||authId.slice(0,8)+'…';

  const renderDebtRow=(d,otherIdField,canRepay)=>`
    <div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between">
        <b>${nameFor(d[otherIdField])}</b>
        <span style="color:${d.effective_status==='overdue'?'var(--red)':'inherit'}">${statusLabel(d.effective_status)}</span>
      </div>
      <div style="font-size:13px;opacity:.7">₹${Number(d.remaining).toFixed(2)} remaining of ₹${Number(d.amount).toFixed(2)}${d.due_date?' · due '+d.due_date:''}${d.reason?' · '+d.reason:''}</div>
      ${canRepay && d.effective_status!=='paid' && d.effective_status!=='cancelled' ? `<button class="save-btn" style="margin-top:6px" onclick="openRepayForm('${d.id}')">Record Repayment</button>` : ''}
    </div>`;

  lentEl.innerHTML = (lent&&lent.length) ? lent.map(d=>renderDebtRow(d,'borrower_id',false)).join('') : '<div style="opacity:.6">Nothing given yet</div>';
  borrowedEl.innerHTML = (borrowed&&borrowed.length) ? borrowed.map(d=>renderDebtRow(d,'lender_id',true)).join('') : '<div style="opacity:.6">Nothing borrowed</div>';
}

function openRepayForm(debtId){
  document.getElementById('repay-debt-modal').dataset.debtId=debtId;
  document.getElementById('rd-amount').value='';
  document.getElementById('rd-note').value='';
  document.getElementById('rd-err').textContent='';
  document.getElementById('repay-debt-modal').classList.add('open');
}

async function submitRepayment(){
  const err=document.getElementById('rd-err');
  const amount=parseFloat(document.getElementById('rd-amount').value);
  if(!amount||amount<=0){err.textContent='Enter a valid amount';return;}
  const debtId=document.getElementById('repay-debt-modal').dataset.debtId;
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined){err.textContent='Could not resolve your account';return;}
  const {error}=await sb.from('shared_debt_payments').insert({
    shared_debt_id:debtId, amount, recorded_by:userId,
    note:document.getElementById('rd-note').value.trim()||null
  });
  if(error){
    err.textContent=error.message||'Failed to record repayment';
    pushErrorLog({message:'Repayment insert failed: '+error.message,source:'submitRepayment'});
    return;
  }
  // A DB trigger (recompute_shared_debt_status, see the schema file)
  // recalculates status/remaining server-side from the payment total — this
  // reload picks up that recalculated value rather than computing it here,
  // so both participants can never see different numbers.
  document.getElementById('repay-debt-modal').classList.remove('open');
  showToast('✅ Repayment recorded');
  loadMoneySummary();
}


async function verifyCloudSessionHealth(){
  if(!CU||!window.sb)return false;
  try{
    const {data,error}=await sb.auth.getUser();
    if(error||!data?.user){
      setCloudStatus('failed',error?.message||'Supabase session unavailable');
      return false;
    }
    const {data:profile,error:profileError}=await sb.from('users')
      .select('id,auth_user_id,is_admin')
      .eq('auth_user_id',data.user.id)
      .maybeSingle();
    if(profileError){
      setCloudStatus('failed',profileError.message||'Profile check failed');
      return false;
    }
    if(!profile){
      setCloudStatus('failed','profile not found');
      return false;
    }
    setCloudStatus('connected','Supabase session verified');
    return true;
  }catch(e){
    console.error('[cloud] session health check failed:',e);
    setCloudStatus('failed',e.message||'Supabase connection failed');
    return false;
  }
}
async function runCloudSyncAfterLogin(){
  const healthy=await verifyCloudSessionHealth();
  if(!healthy)return;
  await Promise.allSettled([syncAndroidTransactions(),syncDebts()]);
}
function refreshVisibleTabsAfterSync(){
  if(document.getElementById('page-home')?.classList.contains('active'))renderHome();
  if(document.getElementById('page-history')?.classList.contains('active'))renderHistory();
}

async function syncAndroidTransactions(){
  beginSyncOp();
  const userId = await resolveSupabaseUserId();
  if(userId===null||userId===undefined){
    endSyncOp(true,'user id not resolved');
    return;
  }
  // Account may have changed while resolveSupabaseUserId() was in flight (e.g. rapid logout).
  if(!CU){endSyncOp(true,'logged out during sync');return;}

  const { data: rows, error } = await sb
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: true });

  if(error){
    console.error('Error fetching Android transactions:', error);
    endSyncOp(true,error.message||'transactions fetch failed');
    return;
  }
  if(!CU){endSyncOp(true,'logged out during sync');return;} // guard again post-await before writing anything

  const data = getData();
  const existingIds = new Set(
    data.filter(e => e.supaId).map(e => String(e.supaId))
  );

  let added = 0;
  (rows || []).forEach(txn => {
    if(existingIds.has(String(txn.id))) return;
    data.push(androidTxnToEntry(txn));
    added++;
  });

  if(added > 0){
    saveData(data);
    refreshVisibleTabsAfterSync();
    showToast(`📲 ${added} new transaction${added > 1 ? 's' : ''} synced from your phone`);
  }

  const statusSuffix=_androidRealtimeStatus==='SUBSCRIBED'?'':' (realtime not connected — polling fallback active)';
  endSyncOp(false,`${(rows||[]).length} found in Supabase, ${added} new added, ${data.filter(e=>e.supaId).length} total tagged${statusSuffix}`);

  subscribeAndroidRealtime(userId);
  startSyncHealthMonitor();
}

let _androidRealtimeChannel=null;
function subscribeAndroidRealtime(userId){
  if(_androidRealtimeChannel){ try{sb.removeChannel(_androidRealtimeChannel);}catch(e){} _androidRealtimeChannel=null; }
  // ── B3: snapshot the identity this subscription belongs to. Both checks are kept
  // (generation counter + username) as defense-in-depth — either one changing independently
  // is sufficient to prove the account context has moved on. ──
  const subscriptionUserId=String(userId);
  const subscriptionUsername=CU;
  const subscriptionGeneration=_acctGeneration;
  _androidRealtimeStatus='IDLE';
  _androidRealtimeChannel=sb.channel('android-transactions-'+userId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'transactions',filter:`user_id=eq.${userId}`},(payload)=>{
      // subscriptionUserId === currentUserId (and generation/username) check — refuse to write
      // if the active account has changed since this subscription was created.
      if(subscriptionGeneration!==_acctGeneration||subscriptionUsername!==CU){
        console.warn('[realtime] Ignoring stale Android transaction event from a previous account session');
        return;
      }
      const txn=payload.new;
      if(String(txn.user_id)!==subscriptionUserId){
        console.warn('[realtime] Ignoring Android transaction event with mismatched user_id');
        return;
      }
      const data=getData();
      if(data.some(e=>String(e.supaId)===String(txn.id)))return; // preserve existing supaId dedup
      data.push(androidTxnToEntry(txn));
      saveData(data);
      refreshVisibleTabsAfterSync();
      showToast('📲 New transaction synced from your phone!');
    })
    .subscribe((status,err)=>{ updateSyncStatus('android',status,err); });
}

// ── DEBTS SYNC ──
function debtRowToLocal(row){
  return {
    name:row.name,amount:row.amount,type:row.type,ts:row.entry_ts,
    cleared:row.cleared,dueDate:row.due_date,interestRate:row.interest_rate,
    installments:row.installments,repaid:row.repaid||0,repayLog:row.repay_log||[],
    supaId:String(row.id)
  };
}
async function syncDebts(){
  beginSyncOp();
  const userId=await resolveSupabaseUserId();
  if(userId===null||userId===undefined){
    showToast('⚠️ Debt sync skipped: user id not resolved','#e53935');
    endSyncOp(true,'debts: user id not resolved');
    return;
  }
  // Account may have changed while resolveSupabaseUserId() was in flight (e.g. rapid logout).
  if(!CU){endSyncOp(true,'debts: logged out during sync');return;}
  const{data:rows,error}=await sb.from('debts').select('*').eq('user_id',userId).order('entry_ts',{ascending:true});
  if(error){
    console.error('Error fetching debts:',error);
    showToast('⚠️ Debt sync failed: '+(error.message||'unknown error'),'#e53935');
    endSyncOp(true,'debts fetch failed');
    return;
  }
  if(!CU){endSyncOp(true,'debts: logged out during sync');return;} // guard again post-await before writing anything
  const debts=getDebts();
  const existingIds=new Set(debts.filter(d=>d.supaId).map(d=>String(d.supaId)));
  let added=0;
  (rows||[]).forEach(row=>{
    if(existingIds.has(String(row.id)))return;
    debts.push(debtRowToLocal(row));
    added++;
  });
  // Also pick up remote edits (cleared/repaid/repayLog) on entries we already have locally
  const byId={};
  (rows||[]).forEach(row=>{byId[String(row.id)]=row;});
  debts.forEach(d=>{
    if(!d.supaId)return;
    const row=byId[String(d.supaId)];
    if(!row)return;
    d.cleared=row.cleared;d.repaid=row.repaid||0;d.repayLog=row.repay_log||[];
  });
  saveDebts(debts);
  if(added>0){renderDebtPage();renderHome();showToast(`💸 ${added} debt${added>1?'s':''} synced`);}
  const statusSuffix=_debtsRealtimeStatus==='SUBSCRIBED'?'':' (realtime not connected — polling fallback active)';
  endSyncOp(false,`${(rows||[]).length} debts found, ${added} new added${statusSuffix}`);
  subscribeDebtsRealtime(userId);
}
let _debtsRealtimeChannel=null;
let _acctGeneration=0;
let _androidRealtimeStatus='IDLE';   // IDLE | SUBSCRIBED | TIMED_OUT | CHANNEL_ERROR | CLOSED
let _debtsRealtimeStatus='IDLE';
let _syncHealthTimer=null;
let _lastFallbackTriggerMs=0;
const FALLBACK_TRIGGER_COOLDOWN_MS=15000; // avoid a tight retry loop if the socket keeps failing
function subscribeDebtsRealtime(userId){
  if(_debtsRealtimeChannel){ try{sb.removeChannel(_debtsRealtimeChannel);}catch(e){} _debtsRealtimeChannel=null; }
  const subscriptionUserId=String(userId);
  const subscriptionUsername=CU;
  const subscriptionGeneration=_acctGeneration;
  _debtsRealtimeStatus='IDLE';
  // Shared guard used by all three handlers below.
  const isStale=(row)=>{
    if(subscriptionGeneration!==_acctGeneration||subscriptionUsername!==CU){
      console.warn('[realtime] Ignoring stale debt event from a previous account session');
      return true;
    }
    if(row&&row.user_id!==undefined&&String(row.user_id)!==subscriptionUserId){
      console.warn('[realtime] Ignoring debt event with mismatched user_id');
      return true;
    }
    return false;
  };
  _debtsRealtimeChannel=sb.channel('debts-'+userId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'debts',filter:`user_id=eq.${userId}`},(payload)=>{
      const row=payload.new;
      if(isStale(row))return;
      const debts=getDebts();
      if(debts.some(d=>String(d.supaId)===String(row.id)))return; // preserve existing supaId dedup
      debts.push(debtRowToLocal(row));
      saveDebts(debts);renderDebtPage();renderHome();
      showToast('💸 New debt entry synced!');
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'debts',filter:`user_id=eq.${userId}`},(payload)=>{
      const row=payload.new;
      if(isStale(row))return;
      const debts=getDebts();
      const d=debts.find(x=>String(x.supaId)===String(row.id));
      if(!d)return;
      d.cleared=row.cleared;d.repaid=row.repaid||0;d.repayLog=row.repay_log||[];
      saveDebts(debts);renderDebtPage();renderHome();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'debts',filter:`user_id=eq.${userId}`},(payload)=>{
      const row=payload.old;
      if(isStale(row))return;
      const debts=getDebts();
      const idx=debts.findIndex(x=>String(x.supaId)===String(row.id));
      if(idx===-1)return;
      debts.splice(idx,1);
      saveDebts(debts);renderDebtPage();renderHome();
    })
    .subscribe((status,err)=>{ updateSyncStatus('debts',status,err); });
}

function teardownRealtimeSubscriptions(reason){
  try{
    if(_androidRealtimeChannel){ sb.removeChannel(_androidRealtimeChannel); }
  }catch(e){ console.error('[realtime] Error removing android channel:',e); }
  try{
    if(_debtsRealtimeChannel){ sb.removeChannel(_debtsRealtimeChannel); }
  }catch(e){ console.error('[realtime] Error removing debts channel:',e); }
  _androidRealtimeChannel=null;
  _debtsRealtimeChannel=null;
  _androidRealtimeStatus='IDLE';
  _debtsRealtimeStatus='IDLE';
  bumpAcctGeneration(); // invalidate any in-flight callback from the outgoing account
  if(_syncHealthTimer){ clearInterval(_syncHealthTimer); _syncHealthTimer=null; }
  renderSyncStatusUI();
  const cEl=document.getElementById('drawer-synccount'); if(cEl)cEl.textContent='Cloud sync: —';
  const dEl=document.getElementById('drawer-debtsynccount'); if(dEl)dEl.textContent='Debt sync: —';
  console.log('[realtime] Subscriptions torn down ('+reason+')');
}

function updateSyncStatus(kind,status,err){
  if(kind==='android')_androidRealtimeStatus=status;
  else if(kind==='debts')_debtsRealtimeStatus=status;
  if(err)console.error('[realtime]',kind,'subscription error:',err);
  if((status==='CHANNEL_ERROR'||status==='TIMED_OUT')&&CU){
    // Don't wait for the 45s health-check tick — fall back to a manual pull, but throttled so a
    // persistently-down socket can't retrigger this on every failed reconnect attempt.
    const now=Date.now();
    if(now-_lastFallbackTriggerMs>FALLBACK_TRIGGER_COOLDOWN_MS){
      _lastFallbackTriggerMs=now;
      if(kind==='android')syncAndroidTransactions(); else if(kind==='debts')syncDebts();
    }
  }
  renderSyncStatusUI();
}

function startSyncHealthMonitor(){
  if(_syncHealthTimer)clearInterval(_syncHealthTimer);
  _syncHealthTimer=setInterval(()=>{
    if(!CU)return;
    if(_androidRealtimeStatus!=='SUBSCRIBED'||_debtsRealtimeStatus!=='SUBSCRIBED'){
      console.warn('[realtime] Unhealthy subscription detected, falling back to manual pull sync',
        {android:_androidRealtimeStatus,debts:_debtsRealtimeStatus});
      syncAndroidTransactions();
      syncDebts();
    }
  },SYNC_HEALTH_CHECK_MS);
}

function renderSyncStatusUI(){
  const el=document.getElementById('drawer-realtime-status');
  if(!el)return;
  const label=(s)=>({IDLE:'not connected',SUBSCRIBED:'live ✓',TIMED_OUT:'timed out — retrying',
    CHANNEL_ERROR:'error — retrying',CLOSED:'closed'}[s]||s);
  const healthy=_androidRealtimeStatus==='SUBSCRIBED'&&_debtsRealtimeStatus==='SUBSCRIBED';
  el.textContent=`Realtime: transactions ${label(_androidRealtimeStatus)}, debts ${label(_debtsRealtimeStatus)}`;
  el.style.color=healthy?'':'var(--red, #e53935)';
}

function bumpAcctGeneration(){ _acctGeneration++; }


/* ProjectVault Events/Media extension.
 * Uses the already-provisioned Supabase festivals/festival_media/ad_campaigns/ad_media
 * schema and pv-media storage bucket. It intentionally keeps private finance data out
 * of public profiles and only uses existing authenticated-user/RLS paths.
 */
(function(){
  const PV_ALLOWED_MEDIA=new Set(['image/jpeg','image/png','image/gif','video/mp4','video/webm']);
  let pvMediaTimer=null,pvMediaIndex=0,pvMediaItems=[],pvCurrentFestival=null;

  function pvEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function pvStorageUrl(path){
    if(!path)return '';
    return SUPABASE_URL+'/storage/v1/object/public/pv-media/'+path.split('/').map(encodeURIComponent).join('/');
  }
  function pvMediaMarkup(m){
    const url=pvStorageUrl(m.storage_path);
    const t=String(m.media_type||'').toLowerCase();
    if(t==='video'||t.startsWith('video/')) return '<video class="pv-media-video" controls playsinline preload="metadata" src="'+pvEsc(url)+'"></video>';
    return '<img class="pv-media-img" loading="lazy" src="'+pvEsc(url)+'" alt="ProjectVault media">';
  }
  window.openEventsMediaModal=async function(){
    document.getElementById('events-media-modal').classList.add('open');
    await pvLoadEventsMedia();
  };
  window.closeEventsMediaModal=function(){
    document.getElementById('events-media-modal').classList.remove('open');
    if(pvMediaTimer){clearInterval(pvMediaTimer);pvMediaTimer=null;}
  };

  async function pvAuthId(){
    try{
      const s=await sb.auth.getSession();
      return s?.data?.session?.user?.id||null;
    }catch(e){return null;}
  }


  async function pvRenderHomeSponsoredMedia(){
    const card=document.getElementById('pv-home-sponsored-card');
    const stage=document.getElementById('pv-home-sponsored-stage');
    const meta=document.getElementById('pv-home-sponsored-meta');
    if(!card||!stage||!meta||!window.sb)return;
    try{
      const {data:campaigns,error}=await sb.from('ad_campaigns').select('*').eq('status','active').order('priority',{ascending:true});
      if(error)throw error;
      const now=new Date();
      const valid=(campaigns||[]).filter(c=>{
        const start=c.start_date?new Date(c.start_date+'T00:00:00'):null;
        const end=c.end_date?new Date(c.end_date+'T23:59:59'):null;
        return (!start||start<=now)&&(!end||end>=now);
      });
      const media=await pvLoadCampaignMedia(valid);
      if(!media.length){card.style.display='none';return;}
      card.style.display='block';
      stage.innerHTML=pvMediaMarkup(media[0]);
      meta.textContent=media.length+' active sponsored media item'+(media.length===1?'':'s')+' · tap View all for the full rotation';
    }catch(e){
      console.error('[ads] Home sponsored media load failed:',e);
      card.style.display='none';
    }
  }

  async function pvLoadEventsMedia(){
    const [festivalRes,adRes]=await Promise.all([
      sb.from('festivals').select('*').eq('is_active',true).order('priority',{ascending:true}).order('festival_date',{ascending:true}),
      sb.from('ad_campaigns').select('*').eq('status','active').order('priority',{ascending:true})
    ]);
    const festivals=festivalRes.data||[];
    const ads=adRes.data||[];
    pvCurrentFestival=pvPickFestival(festivals);
    await Promise.all([pvRenderPriority(festivals,ads),pvRenderBirthdays(),pvRenderFestivals(festivals),pvRenderAds(ads)]);
    if(await pvIsAdmin()) await pvRenderAdmin(ads);
  }

  function pvPickFestival(list){
    const now=new Date(); now.setHours(0,0,0,0);
    const current=list.find(f=>{
      const d=new Date(f.festival_date+'T00:00:00'); return d.getTime()===now.getTime();
    });
    if(current)return current;
    return list.find(f=>new Date(f.festival_date+'T00:00:00')>=now)||null;
  }

  async function pvLoadFestivalMedia(festivalId){
    if(!festivalId)return [];
    const {data}=await sb.from('festival_media').select('*').eq('festival_id',festivalId).eq('is_active',true).order('weight',{ascending:false}).order('created_at',{ascending:false});
    return data||[];
  }

  async function pvRenderPriority(festivals,ads){
    const title=document.getElementById('event-priority-title'),sub=document.getElementById('event-priority-sub'),stage=document.getElementById('event-media-stage');
    if(!title)return;
    pvMediaItems=[];
    const bday=await pvGetOwnBirthday();
    if(bday && pvIsToday(bday)){
      title.textContent='🎂 Happy Birthday!';
      sub.textContent='Your birthday is today.';
    }else if(pvCurrentFestival && pvIsToday(pvCurrentFestival.festival_date)){
      title.textContent='🪔 '+pvCurrentFestival.name;
      sub.textContent=pvCurrentFestival.greeting||'Celebrate the day with ProjectVault.';
      pvMediaItems=await pvLoadFestivalMedia(pvCurrentFestival.id);
    }else if(pvCurrentFestival){
      const days=Math.max(0,Math.ceil((new Date(pvCurrentFestival.festival_date+'T00:00:00')-new Date(new Date().toDateString()))/86400000));
      title.textContent='📅 '+pvCurrentFestival.name;
      sub.textContent=(pvCurrentFestival.greeting||'Upcoming festival')+' · '+days+' day'+(days===1?'':'s')+' remaining';
      pvMediaItems=await pvLoadFestivalMedia(pvCurrentFestival.id);
    }else if(ads.length){
      title.textContent='📢 Sponsored media';
      sub.textContent='Rotating media selected by campaign priority.';
      pvMediaItems=await pvLoadCampaignMedia(ads);
    }else{
      title.textContent='✨ ProjectVault';
      sub.textContent='No active event or sponsored media right now.';
    }
    pvRenderStage();
  }

  function pvRenderStage(){
    const stage=document.getElementById('event-media-stage'); if(!stage)return;
    if(!pvMediaItems.length){stage.innerHTML='<div style="padding:24px;text-align:center;color:var(--muted)">No media scheduled for this event.</div>';return;}
    const item=pvMediaItems[pvMediaIndex%pvMediaItems.length];
    stage.innerHTML=pvMediaMarkup(item);
    if(pvMediaItems.length>1){
      if(pvMediaTimer)clearInterval(pvMediaTimer);
      pvMediaTimer=setInterval(()=>{pvMediaIndex++;pvRenderStage();},10000);
    }
  }

  async function pvLoadCampaignMedia(campaigns){
    const ids=campaigns.map(c=>c.id); if(!ids.length)return [];
    const {data}=await sb.from('ad_media').select('*').in('campaign_id',ids).eq('is_active',true).order('sort_order',{ascending:true});
    return data||[];
  }

  function pvIsToday(dateStr){
    const d=new Date(dateStr+'T00:00:00'),n=new Date(); return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();
  }

  async function pvGetOwnBirthday(){
    const id=await pvAuthId(); if(!id)return null;
    const {data}=await sb.from('users').select('birthday').eq('auth_user_id',id).maybeSingle();
    return data?.birthday||null;
  }

  async function pvRenderBirthdays(){
    const own=document.getElementById('birthday-own-editor'),friends=document.getElementById('birthday-friends-list');
    if(!own)return;
    const id=await pvAuthId();
    if(!id){own.innerHTML='<div style="color:var(--muted)">Sign in to manage birthdays.</div>';return;}
    const {data:u}=await sb.from('users').select('birthday,show_birthday_to_friends').eq('auth_user_id',id).maybeSingle();
    own.innerHTML='<div style="font-size:12px;color:var(--muted);margin-bottom:6px">Your birthday</div>'+
      '<div style="display:flex;gap:7px;align-items:center"><input class="date-inp" id="pv-own-birthday" type="date" value="'+pvEsc(u?.birthday||'')+'" style="margin:0;flex:1">'+
      '<button class="pill-btn" onclick="pvSaveBirthday()">Save</button></div>'+
      '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);margin-top:8px"><input id="pv-bday-public" type="checkbox" '+(u?.show_birthday_to_friends!==false?'checked':'')+'> Show to connected friends</label>';
    const {data:conns}=await sb.from('connections').select('user_a,user_b').or('user_a.eq.'+id+',user_b.eq.'+id);
    const ids=(conns||[]).map(c=>c.user_a===id?c.user_b:c.user_a);
    if(!ids.length){friends.innerHTML='<div style="font-size:12px;color:var(--muted);margin-top:10px">No connected friends yet.</div>';return;}
    const {data:fs}=await sb.from('users').select('auth_user_id,name,username,birthday').in('auth_user_id',ids).not('birthday','is',null);
    const today=new Date();
    const rows=(fs||[]).map(f=>{
      const raw=new Date(f.birthday+'T00:00:00'); const next=new Date(today.getFullYear(),raw.getMonth(),raw.getDate());
      if(next<new Date(today.getFullYear(),today.getMonth(),today.getDate()))next.setFullYear(today.getFullYear()+1);
      const days=Math.ceil((next-new Date(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
      return {f,days};
    }).sort((a,b)=>a.days-b.days);
    friends.innerHTML=rows.length?rows.map(x=>'<div class="pv-event-row"><div><b>🎂 '+pvEsc(x.f.name||x.f.username||'Friend')+'</b><div style="font-size:11px;color:var(--muted)">'+(x.days===0?'Today!':x.days+' day'+(x.days===1?'':'s')+' remaining')+'</div></div><span class="pv-event-pill">'+new Date(x.f.birthday+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short'})+'</span></div>').join(''):'<div style="font-size:12px;color:var(--muted)">No visible friend birthdays.</div>';
  }

  window.pvSaveBirthday=async function(){
    const id=await pvAuthId(); if(!id)return;
    const birthday=document.getElementById('pv-own-birthday')?.value||null;
    const show=document.getElementById('pv-bday-public')?.checked!==false;
    const {error}=await sb.from('users').update({birthday,show_birthday_to_friends:show}).eq('auth_user_id',id);
    if(error){showToast('⚠️ Could not save birthday');return;}
    showToast('🎂 Birthday saved');
    await pvLoadEventsMedia();
  };

  async function pvRenderFestivals(festivals){
    const el=document.getElementById('festival-list'); if(!el)return;
    const today=new Date();today.setHours(0,0,0,0);
    const rows=festivals.filter(f=>new Date(f.festival_date+'T00:00:00')>=today).slice(0,8);
    el.innerHTML=rows.length?rows.map(f=>'<div class="pv-event-row"><div><b>'+pvEsc(f.name)+'</b><div style="font-size:11px;color:var(--muted)">'+pvEsc(f.greeting||'')+'</div></div><span class="pv-event-pill">'+pvEsc(f.festival_date)+'</span></div>').join(''):'<div style="color:var(--muted);font-size:12px">No upcoming festivals configured.</div>';
  }

  async function pvRenderAds(ads){
    const el=document.getElementById('ad-media-list'); if(!el)return;
    const media=await pvLoadCampaignMedia(ads);
    el.innerHTML=media.length?media.slice(0,6).map(m=>'<div class="pv-event-row"><div style="flex:1"><b>'+pvEsc((ads.find(a=>a.id===m.campaign_id)||{}).name||'Sponsored media')+'</b><div style="font-size:11px;color:var(--muted)">'+pvEsc(m.media_type)+'</div></div><span class="pv-event-pill">Active</span></div>').join(''):'<div style="color:var(--muted);font-size:12px">No active sponsored media.</div>';
  }

  async function pvIsAdmin(){
    const id=await pvAuthId();if(!id)return false;
    const {data}=await sb.from('users').select('is_admin').eq('auth_user_id',id).maybeSingle();
    return data?.is_admin===true;
  }
  async function pvRenderAdmin(ads){
    const card=document.getElementById('events-admin-card');if(!card)return;
    card.style.display='block';
    const [cr,fr]=await Promise.all([
      sb.from('ad_campaigns').select('id,name').order('created_at',{ascending:false}).limit(100),
      sb.from('festivals').select('id,name,festival_date').order('festival_date',{ascending:true}).limit(100)
    ]);
    const select=document.getElementById('adm-campaign-select');
    const fselect=document.getElementById('adm-festival-select');
    if(select)select.innerHTML=(cr.data||[]).map(a=>'<option value="'+pvEsc(a.id)+'">'+pvEsc(a.name)+'</option>').join('')||'<option value="">No campaigns</option>';
    if(fselect)fselect.innerHTML=(fr.data||[]).map(f=>'<option value="'+pvEsc(f.id)+'">'+pvEsc(f.name)+' · '+pvEsc(f.festival_date)+'</option>').join('')||'<option value="">No festivals</option>';
  }
  window.pvAdminCreateFestival=async function(){
    const id=await pvAuthId(); if(!id)return;
    const name=document.getElementById('adm-festival-name').value.trim(),date=document.getElementById('adm-festival-date').value,greeting=document.getElementById('adm-festival-greeting').value.trim();
    const st=document.getElementById('events-admin-status'); if(!name||!date){st.textContent='Festival name and date are required.';return;}
    const {error}=await sb.from('festivals').insert({name,festival_date:date,greeting:greeting||null,priority:10,is_active:true,created_by:id});
    st.textContent=error?('Error: '+error.message):'Festival created.';
    if(!error){document.getElementById('adm-festival-name').value='';await pvLoadEventsMedia();}
  };
  window.pvAdminCreateCampaign=async function(){
    const id=await pvAuthId();if(!id)return;
    const name=document.getElementById('adm-ad-name').value.trim();if(!name){document.getElementById('events-admin-status').textContent='Campaign name is required.';return;}
    const payload={name,folder:document.getElementById('adm-ad-folder').value.trim()||'General Ads',start_date:document.getElementById('adm-ad-start').value||null,end_date:document.getElementById('adm-ad-end').value||null,priority:10,status:'active',created_by:id};
    const {error}=await sb.from('ad_campaigns').insert(payload);
    document.getElementById('events-admin-status').textContent=error?('Error: '+error.message):'Campaign created.';
    if(!error){document.getElementById('adm-ad-name').value='';await pvLoadEventsMedia();}
  };
  window.pvAdminUploadFestivalMedia=async function(){
    const id=await pvAuthId(),festival=document.getElementById('adm-festival-select').value,file=document.getElementById('adm-festival-media-file').files[0],st=document.getElementById('events-admin-status');
    if(!id||!festival||!file){st.textContent='Select a festival and media file.';return;}
    if(!PV_ALLOWED_MEDIA.has(file.type)){st.textContent='Unsupported media type.';return;}
    if(file.size>50*1024*1024){st.textContent='Media exceeds the 50 MB client safety limit.';return;}
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path='festivals/'+festival+'/'+Date.now()+'_'+safe;
    const up=await sb.storage.from('pv-media').upload(path,file,{upsert:false,contentType:file.type});
    if(up.error){st.textContent='Upload error: '+up.error.message;return;}
    const {error}=await sb.from('festival_media').insert({festival_id:festival,storage_path:path,media_type:(file.type==='image/gif'?'gif':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':'image'),weight:1,is_active:true});
    st.textContent=error?('Metadata error: '+error.message):'Festival media uploaded successfully.';
    if(error)await sb.storage.from('pv-media').remove([path]); else {document.getElementById('adm-festival-media-file').value='';await pvLoadEventsMedia();}
  };
  window.pvAdminUploadAdMedia=async function(){
    const id=await pvAuthId(),campaign=document.getElementById('adm-campaign-select').value,file=document.getElementById('adm-media-file').files[0],st=document.getElementById('events-admin-status');
    if(!id||!campaign||!file){st.textContent='Select a campaign and media file.';return;}
    if(!PV_ALLOWED_MEDIA.has(file.type)){st.textContent='Unsupported media type.';return;}
    if(file.size>50*1024*1024){st.textContent='Media exceeds the 50 MB client safety limit.';return;}
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path='ads/'+campaign+'/'+Date.now()+'_'+safe;
    const up=await sb.storage.from('pv-media').upload(path,file,{upsert:false,contentType:file.type});
    if(up.error){st.textContent='Upload error: '+up.error.message;return;}
    const {error}=await sb.from('ad_media').insert({campaign_id:campaign,storage_path:path,media_type:(file.type==='image/gif'?'gif':file.type.startsWith('video/')?'video':'image'),file_size_bytes:file.size,sort_order:0,is_active:true});
    st.textContent=error?('Metadata error: '+error.message):'Media uploaded successfully.';
    if(error)await sb.storage.from('pv-media').remove([path]); else {document.getElementById('adm-media-file').value='';await pvLoadEventsMedia();}
  };
})();


(function(){
  let timer=null,progressTimer=null,items=[],index=0,sound=false,started=false;
  const DISPLAY_MS=10000;
  function esc(v){return typeof pvEsc==='function'?pvEsc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function todayBirthday(b){if(!b)return false;const d=new Date(String(b).slice(0,10)+'T00:00:00'),n=new Date();return d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();}
  function mediaUrl(path){return typeof pvStorageUrl==='function'?pvStorageUrl(path):((window.SUPABASE_URL||'')+'/storage/v1/object/public/pv-media/'+String(path||'').split('/').map(encodeURIComponent).join('/'));}
  function mediaHtml(m){const t=String(m?.media_type||'').toLowerCase(),u=mediaUrl(m?.storage_path);if(!u)return '';if(t==='video'||t.startsWith('video/'))return '<video class="pv-fd-media cover" autoplay '+(sound?'':'muted')+' playsinline preload="auto" src="'+esc(u)+'"></video>';return '<img class="pv-fd-media cover" src="'+esc(u)+'" alt="ProjectVault display media">';}
  async function loadBirthdays(){
    try{
      const {data,error}=await sb.from('users').select('auth_user_id,name,username,birthday,avatar,show_birthday_to_friends').not('birthday','is',null);
      if(error){console.warn('[display] birthday load:',error);return []}
      return (data||[]).filter(u=>todayBirthday(u.birthday) && u.show_birthday_to_friends!==false).map(u=>({kind:'birthday',name:u.name||u.username||'Friend',avatar:u.avatar||null}));
    }catch(e){console.warn('[display] birthday exception:',e);return []}
  }
  async function loadFestivals(){
    try{
      const {data,error}=await sb.from('festivals').select('*').eq('is_active',true).order('priority',{ascending:true}).order('festival_date',{ascending:true});
      if(error)return [];
      const n=new Date();n.setHours(0,0,0,0);
      const f=(data||[]).find(x=>new Date(String(x.festival_date).slice(0,10)+'T00:00:00').getTime()===n.getTime()) || (data||[]).find(x=>new Date(String(x.festival_date).slice(0,10)+'T00:00:00')>=n);
      if(!f)return [];
      const {data:ms}=await sb.from('festival_media').select('*').eq('festival_id',f.id).eq('is_active',true).order('weight',{ascending:false}).order('created_at',{ascending:false});
      const out=(ms||[]).map(m=>({kind:'festival-media',name:f.name,sub:f.greeting||'Celebrate the festival with ProjectVault.',media:m}));
      if(!out.length)out.push({kind:'festival',name:f.name,sub:f.greeting||'Celebrate the festival with ProjectVault.'});
      return out;
    }catch(e){console.warn('[display] festival exception:',e);return []}
  }
  async function loadAds(){
    try{
      const {data,error}=await sb.from('ad_campaigns').select('*').eq('status','active').order('priority',{ascending:true});
      if(error)return [];
      const now=new Date();const campaigns=(data||[]).filter(c=>{const st=c.start_date?new Date(c.start_date+'T00:00:00'):null,en=c.end_date?new Date(c.end_date+'T23:59:59'):null;return (!st||st<=now)&&(!en||en>=now)});
      if(!campaigns.length)return [];
      const {data:ms}=await sb.from('ad_media').select('*').in('campaign_id',campaigns.map(c=>c.id)).eq('is_active',true).order('sort_order',{ascending:true});
      const names=Object.fromEntries(campaigns.map(c=>[String(c.id),c.name]));
      return (ms||[]).map(m=>({kind:'ad',name:names[String(m.campaign_id)]||'Sponsored',media:m}));
    }catch(e){console.warn('[display] ads exception:',e);return []}
  }
  async function build(){
    const [bs,fs,ads]=await Promise.all([loadBirthdays(),loadFestivals(),loadAds()]);
    items=[...bs,...fs,...ads];
    return items;
  }
  function render(item){
    const c=document.getElementById('pv-fd-content'),st=document.getElementById('pv-fd-status'),bar=document.getElementById('pv-fd-progress-bar');if(!c)return;
    if(item.kind==='birthday'){
      const av=item.avatar?'<img class="pv-fd-avatar" src="'+esc(item.avatar)+'" alt="'+esc(item.name)+'">':'<div class="pv-fd-avatar pv-fd-avatar-placeholder">🎂</div>';
      c.innerHTML='<div class="pv-fd-card"><div class="pv-fd-birthday">'+av+'<div class="pv-fd-copy"><div class="pv-fd-kicker">🎉 Today is a special day</div><div class="pv-fd-title">Happy Birthday,<br>'+esc(item.name)+'!</div><div class="pv-fd-sub">Wishing you happiness, good health and a wonderful year ahead. 💜</div></div></div></div>';
      st.textContent='🎂 Birthday wish · '+item.name;
    }else if(item.kind==='festival-media'){
      c.innerHTML=mediaHtml(item.media)||'<div class="pv-fd-card"><div class="pv-fd-copy"><div class="pv-fd-title">'+esc(item.name)+'</div><div class="pv-fd-sub">'+esc(item.sub)+'</div></div></div>';
      st.textContent='🪔 '+item.name+' · Festival media';
    }else if(item.kind==='festival'){
      c.innerHTML='<div class="pv-fd-card"><div class="pv-fd-copy" style="text-align:center"><div class="pv-fd-kicker">🪔 Festival</div><div class="pv-fd-title">'+esc(item.name)+'</div><div class="pv-fd-sub">'+esc(item.sub)+'</div></div></div>';
      st.textContent='🪔 '+item.name;
    }else{
      c.innerHTML=mediaHtml(item.media)||'<div class="pv-fd-card"><div class="pv-fd-copy"><div class="pv-fd-kicker">📢 Sponsored</div><div class="pv-fd-title">'+esc(item.name)+'</div></div></div>';
      st.textContent='📢 Admin advertisement · '+item.name;
    }
    if(bar){bar.style.transition='none';bar.style.width='0%';requestAnimationFrame(()=>{bar.style.transition='width '+DISPLAY_MS+'ms linear';bar.style.width='100%';});}
    const v=c.querySelector('video');if(v){v.muted=!sound;v.play().catch(()=>{});}
  }
  async function next(){
    if(!started)return;
    if(!items.length)await build();
    if(!items.length){const c=document.getElementById('pv-fd-content');if(c)c.innerHTML='<div class="pv-fd-card"><div class="pv-fd-copy" style="text-align:center"><div class="pv-fd-title">ProjectVault</div><div class="pv-fd-sub">No birthday, festival or active admin advertisement is scheduled right now.</div></div></div>';document.getElementById('pv-fd-status').textContent='Nothing scheduled right now';return;}
    index=index%items.length;render(items[index++]);clearTimeout(timer);timer=setTimeout(next,DISPLAY_MS);
  }
  window.pvOpenDisplay=async function(){
    const el=document.getElementById('pv-full-display');if(!el)return;el.classList.add('open');el.setAttribute('aria-hidden','false');started=true;index=0;items=[];await build();await next();
    try{if(!document.fullscreenElement)await el.requestFullscreen();}catch(e){}
  };
  window.pvCloseDisplay=function(){started=false;clearTimeout(timer);clearInterval(progressTimer);const el=document.getElementById('pv-full-display');if(el){el.classList.remove('open');el.setAttribute('aria-hidden','true');}if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});};
  window.pvToggleDisplaySound=function(){sound=!sound;const b=document.getElementById('pv-fd-sound');if(b)b.textContent=sound?'🔊 Sound on':'🔇 Sound off';const v=document.querySelector('#pv-fd-content video');if(v){v.muted=!sound;if(sound)v.play().catch(()=>{});}};
  document.addEventListener('fullscreenchange',()=>{const el=document.getElementById('pv-full-display');if(el&&!document.fullscreenElement&&el.classList.contains('open')){/* keep in-app overlay open */}});
})();
