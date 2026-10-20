
/* ============================================================
   AUTH LAYER
   Identical contract to Live Timings' rtGate integration, and
   deliberately reuses the SAME localStorage keys so a driver
   who is logged in on one page is already logged in on the
   other. Extends the returned "meta" object's tier detection
   with silver/gold-specific helpers this page needs.
   ============================================================ */
(() => {
  const AUTH={FUNCTION:'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate',REDIRECT_URI:(window.IFWL_AUTH_REDIRECT||location.origin+location.pathname),SESSION_KEY:'IFWL_PATREON_SESSION',META_KEY:'IFWL_PATREON_META'};
  const q=id=>document.getElementById(id);
  const bar=q('ifwlAccountBar'),title=q('ifwlAccountTitle'),text=q('ifwlAccountText'),login=q('discordLoginBtn'),navLogin=q('discordAccountBtn'),logout=q('discordLogoutBtn');
  const wall=q('ifwlLoginWall'),wallMsg=q('loginWallMessage'),wallErr=q('loginWallError'),wallLogin=q('loginWallDiscordBtn'),wallLogout=q('loginWallLogoutBtn');
  let meta=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeStore(k,v){try{localStorage.setItem(k,v);return true}catch(_){try{sessionStorage.setItem(k,v);return true}catch(__){return false}}}
  function readStore(k){try{return localStorage.getItem(k)||sessionStorage.getItem(k)||''}catch(_){return ''}}
  function removeStore(k){try{localStorage.removeItem(k)}catch(_){} try{sessionStorage.removeItem(k)}catch(_){}}
  function userName(m){return m?.nick||m?.globalName||m?.global_name||m?.username||'Discord user'}
  function userId(m){return String(m?.userId||m?.discordId||m?.discord_id||m?.id||'guest')}
  function tierStr(m){return String(m?.patreonTier||m?.tier||m?.role||'').toLowerCase()}
  function detailed(m){if(!m)return false;if(Object.prototype.hasOwnProperty.call(m,'liveTimingsDetailedAccess'))return m.liveTimingsDetailedAccess===true;const t=tierStr(m);return !!(m.staffBypass||t.includes('bronze')||t.includes('silver')||t.includes('gold')||t.includes('owner')||t.includes('ops'))}
  function silverPlus(m){if(!m)return false;const t=tierStr(m);return !!(m.staffBypass||t.includes('silver')||t.includes('gold')||t.includes('owner')||t.includes('ops'))}
  function isGold(m){if(!m)return false;const t=tierStr(m);return !!(m.staffBypass||t.includes('gold')||t.includes('owner')||t.includes('ops'))}
  function staff(m){if(!m)return false;const t=tierStr(m);return !!(m.canModerateTunes||m.staffBypass||t.includes('owner')||t.includes('ops'))}
  // ✅ ADDED: Commentator is its own independent flag - having role
  // 1295114710085271644 makes someone a Commentator regardless of any other
  // role they hold, so this never folds into the staff/tier checks above.
  function isCommentatorMeta(m){return !!(m && (m.commentatorAccess === true || m.commentator === true))}
  // ✅ ADDED: tighter staff tiers for the new nav permission split - Owner
  // only, and Owner+Ops (excluding Steward). Purely a UI-visibility signal;
  // the real enforcement lives server-side in canManageLicencesOwnerOnly/
  // canManageLicencesOpsOnly, same as everywhere else in this file.
  function isOwnerTier(m){if(!m)return false;return tierStr(m).includes('owner')}
  function isOpsOrOwnerTier(m){if(!m)return false;const t=tierStr(m);return t.includes('owner')||t.includes('ops')}
  // ✅ ADDED: Head Moderator - a standalone permission (new Discord
  // moderation area only), same independent-flag pattern as Commentator
  // above rather than folding into the Owner/Ops tier string, since it's
  // not a Patreon tier and shouldn't make the account bar show an "Owner"-
  // style pill. Owner always has it too (isHeadModerator is already true
  // for Owner server-side - see canModerateDiscord in index.js).
  function isHeadModMeta(m){return !!(m && m.isHeadModerator === true)}
  function anyLogin(m){return !!(m&&(m.sessionToken||m.userId||m.discordId||m.username||m.activeRacer||m.patreonGranted||m.staffBypass))}
  function hideWall(){wall.classList.add('hidden');document.body.classList.remove('login-wall-open');document.documentElement.classList.remove('login-wall-open');document.body.classList.add('access-authorised')}
  function showWall(message,error){document.body.classList.remove('access-authorised');document.body.classList.add('login-wall-open');document.documentElement.classList.add('login-wall-open');wall.classList.remove('hidden');wallMsg.textContent=message||'Login with Discord to view or manage your IFWL racing licence.';wallErr.textContent=error||'';wallErr.style.display=error?'block':'none';wallLogout.classList.toggle('hidden',!meta)}

  function apply(m){
    meta=m||null; window.IFWL_META=meta;
    window.IFWL_DETAILED=detailed(meta); window.IFWL_SILVER_PLUS=silverPlus(meta); window.IFWL_GOLD=isGold(meta); window.IFWL_STAFF=staff(meta);
    window.IFWL_OWNER=isOwnerTier(meta); window.IFWL_OPS_PLUS=isOpsOrOwnerTier(meta);
    window.IFWL_COMMENTATOR=isCommentatorMeta(meta);
    // Commentator-only = a commentator who is not also a racer/staff: their whole site is Drivers to Watch.
    window.IFWL_COMMENTATOR_ONLY=!!(window.IFWL_COMMENTATOR && !window.IFWL_STAFF && !window.IFWL_OWNER && !(meta&&meta.activeRacer) && !(meta&&meta.patreonGranted));
    window.IFWL_HEAD_MOD=isHeadModMeta(meta);
    // ✅ ADDED: real values captured once, never overwritten by the staff
    // "View As" simulator below - this is how the simulator can restore the
    // actual view, and how its own control stays visible even while
    // simulating a lower tier that would otherwise hide staff-only UI.
    window.IFWL_REAL_GOLD=window.IFWL_GOLD; window.IFWL_REAL_SILVER_PLUS=window.IFWL_SILVER_PLUS; window.IFWL_REAL_STAFF=window.IFWL_STAFF;
    window.IFWL_REAL_OWNER=window.IFWL_OWNER; window.IFWL_REAL_OPS_PLUS=window.IFWL_OPS_PLUS;
    window.IFWL_REAL_HEAD_MOD=window.IFWL_HEAD_MOD;
    if(window.IFWL_STAFF) document.body.classList.add('real-staff');
    document.body.classList.toggle('patreon-access',window.IFWL_DETAILED);
    document.body.classList.toggle('discord-logged-in',anyLogin(meta));
    document.body.classList.toggle('licence-silver-plus',window.IFWL_SILVER_PLUS); window.applyPatronHome&&window.applyPatronHome();
    document.body.classList.toggle('licence-gold',window.IFWL_GOLD);
    document.body.classList.toggle('staff-access',window.IFWL_STAFF);
    document.body.classList.toggle('owner-access',window.IFWL_OWNER);
    document.body.classList.toggle('ops-access',window.IFWL_OPS_PLUS);
    document.body.classList.toggle('commentator-access',window.IFWL_COMMENTATOR);
    document.body.classList.toggle('commentator-only',window.IFWL_COMMENTATOR_ONLY);
    document.body.classList.toggle('headmod-access',window.IFWL_HEAD_MOD);
    if(meta){
      const t=meta.patreonTier||meta.tier||meta.role||'Discord';
      title.innerHTML=`Logged in as ${esc(userName(meta))} <span class="access-pill granted">${esc(t)}</span>`;
      text.textContent='Every driver, Active Racer or above, can open the Licence Centre.';
      login.classList.add('hidden'); logout.classList.remove('hidden'); navLogin.textContent=userName(meta);
      hideWall();
    } else {
      title.innerHTML='Public access <span class="access-pill locked">Not logged in</span>';
      text.textContent='Login with Discord to view your licence.';
      login.classList.remove('hidden'); logout.classList.add('hidden'); navLogin.textContent='Discord Login';
      showWall();
    }
    window.dispatchEvent(new CustomEvent('ifwl-auth-changed',{detail:{meta}}));
  }
  async function json(url,opts){const r=await fetch(url,{cache:'no-store',...(opts||{})});const t=await r.text();let d;try{d=JSON.parse(t)}catch{throw new Error('Authentication service returned an invalid response.')}if(!r.ok)throw new Error(d?.error||`Request failed (${r.status})`);return d}
  async function start(){try{if(window.IFWL_LOGIN_RETURN){try{sessionStorage.setItem('IFWL_LOGIN_RETURN',String(window.IFWL_LOGIN_RETURN))}catch(_){}}const d=await json(AUTH.FUNCTION+`?start=1&redirect=${encodeURIComponent(AUTH.REDIRECT_URI)}`);if(!d.url)throw new Error(d.error||'No Discord login URL returned.');location.href=d.url}catch(e){showWall(null,e.message)}}
  async function callback(){const p=new URLSearchParams(location.search),code=p.get('code'),error=p.get('error');if(error){history.replaceState({},document.title,AUTH.REDIRECT_URI);showWall(null,error);return true}if(!code)return false;showWall('Checking your IFWL Discord and Patreon roles...');try{const d=await json(AUTH.FUNCTION+`?code=${encodeURIComponent(code)}&redirect=${encodeURIComponent(AUTH.REDIRECT_URI)}&issue=1&patreon=1`);history.replaceState({},document.title,AUTH.REDIRECT_URI);if(d.sessionToken)safeStore(AUTH.SESSION_KEY,d.sessionToken);safeStore(AUTH.META_KEY,JSON.stringify(d));
    /* ONBOARDING hook: brand-new members (no roles -> no full session) and drivers who must finish sign-up are sent to the onboarding page instead of being refused. */
    const ob=d.onboarding||{};
    if(d.onboardingToken&&ob.live&&(!d.sessionToken||ob.mustComplete)){safeStore('IFWL_ONBOARD_TOKEN',d.onboardingToken);showWall('Taking you to IFWL sign-up...');location.replace(AUTH.REDIRECT_URI.replace(/[^\/]*$/,'')+'ifwlonboarding.html');return true}
    /* LOGIN-RETURN hook: logins started from a split page (licence-home.html, licence-races.html ...) come back through licence.html (the one registered Discord return page) and are sent straight back to the page they started on. */
    {let ret='';try{ret=sessionStorage.getItem('IFWL_LOGIN_RETURN')||'';sessionStorage.removeItem('IFWL_LOGIN_RETURN')}catch(_){}
     if(!ret&&window.IFWL_FORWARD_TO_PAGES)ret='licence-home.html';
     if(ret&&d.sessionToken&&/^licence-[a-z]+\.html$/.test(ret)){showWall('Taking you back...');location.replace(AUTH.REDIRECT_URI.replace(/[^\/]*$/,'')+ret);return true}}
    apply(d)}catch(e){history.replaceState({},document.title,AUTH.REDIRECT_URI);showWall(null,e.message)}return true}
  async function verify(){const token=readStore(AUTH.SESSION_KEY);if(!token){apply(null);return}try{const d=await json(AUTH.FUNCTION+`?patreonStatus=1&token=${encodeURIComponent(token)}`);safeStore(AUTH.META_KEY,JSON.stringify(d));apply(d)}catch{removeStore(AUTH.SESSION_KEY);removeStore(AUTH.META_KEY);apply(null)}}
  function signout(){removeStore(AUTH.SESSION_KEY);removeStore(AUTH.META_KEY);removeStore('IFWL_ONBOARD_TOKEN');removeStore('IFWL_OB_GATE');apply(null)}
  [login,navLogin,wallLogin].forEach(b=>b?.addEventListener('click',start));
  [logout,wallLogout].forEach(b=>b?.addEventListener('click',signout));
  window.IFWL_AUTH={sessionToken:()=>readStore(AUTH.SESSION_KEY),userId,userName,FUNCTION:AUTH.FUNCTION,signout};
  /* Start auth only once every script has run (DOMContentLoaded), so no module can miss the first 'ifwl-auth-changed'. */
  const startAuth=async()=>{const handled=await callback();if(!handled)await verify()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startAuth,{once:true});else startAuth();
})();
;(window.IFWL_FILES=window.IFWL_FILES||{})['00-auth.js']='p3s2';
