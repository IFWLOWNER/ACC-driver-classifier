
/* ============================================================
   ONBOARDING GATE
   Once the Owner switches onboarding live, drivers who have not
   finished sign-up see a banner (during the grace period) and are
   sent to ifwlonboarding.html once the grace period ends (if the
   Owner turned the lock on). Costs one cheap call per 5 minutes,
   and does nothing at all while onboarding is off.
   ============================================================ */
(() => {
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const KEY = 'IFWL_OB_GATE';
  let done = false;
  const url = () => location.origin + location.pathname.replace(/[^\/]*$/, '') + 'ifwlonboarding.html';
  function banner(g) {
    if (document.getElementById('obBanner')) return;
    const when = g.graceUntilMs ? ' by <b>' + new Date(g.graceUntilMs).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + '</b>' : '';
    const d = document.createElement('div');
    d.id = 'obBanner';
    d.style.cssText = 'position:sticky;top:0;z-index:9999;background:#fff7e6;border-bottom:2px solid #f0cf8a;color:#6b4a06;padding:10px 14px;font:600 14px/1.4 Inter,Arial,sans-serif;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center';
    d.innerHTML = '<span>IFWL sign-up has moved here. Please confirm your details' + when + ' - it takes about 3 minutes.</span><a href="' + url() + '" style="background:#0e9c8a;color:#fff;border-radius:8px;padding:7px 14px;text-decoration:none;font-weight:700">Finish sign-up</a>';
    document.body.prepend(d);
  }
  function act(g) {
    if (!g || !g.live || g.complete) return;
    if (g.mustComplete) { location.replace(url()); return; }
    if (g.showBanner) banner(g);
  }
  async function check() {
    if (done) return;
    const t = window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken();
    if (!t) return;
    done = true;
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (c && Date.now() - c.at < 5 * 60 * 1000) return act(c.g);
    } catch (_) {}
    try {
      const r = await fetch(FN + '?onboardingGate=1&token=' + encodeURIComponent(t), { cache: 'no-store' });
      if (!r.ok) return;
      const g = await r.json();
      try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), g })); } catch (_) {}
      act(g);
    } catch (_) { /* never block the page over this */ }
  }
  window.addEventListener('ifwl-auth-changed', check);
  setTimeout(check, 1500);
})();
