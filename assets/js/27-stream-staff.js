/* ============================================================
   STREAM OVERLAY - Staff page (Owner / Ops Manager).
   Put a message on the live Twitch stream (ticker + pop-up) and see how to add the overlay to OBS.
   The overlay itself is stream.html; it reads rtGate ?streamFeed=1 (public) and these staff endpoints:
   ?staffStreamList / ?staffStreamAnnounceAdd / ?staffStreamAnnounceRemove.
   ============================================================ */
(() => {
  'use strict';
  if (window.IFWL_StreamStaff) return;
  (window.IFWL_FILES = window.IFWL_FILES || {})['27-stream-staff.js'] = 's1';
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const OVERLAY = new URL('stream.html', location.href).href.split('?')[0];
  const when = (ms) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (e) { return '-'; } };
  const left = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 120 ? Math.round(m / 60) + 'h' : m + ' min'; };
  async function api(name, body) {
    const t = token(); if (!t) throw new Error('Please log in first');
    const r = await fetch(FN + '?' + name + '=1&token=' + encodeURIComponent(t), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
    return d;
  }
  const CSS = '.ss-box{border:1px solid var(--ifwl-line,#dde3ec);border-radius:12px;padding:14px;margin:12px 0}.ss-box h4{margin:0 0 6px;font-size:15px}'
    + '.ss-sm{font-size:12px;opacity:.75}.ss-bad{color:#d92d20;font-weight:700}.ss-good{color:#13a56b;font-weight:700}'
    + '.ss-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px}'
    + '.ss-in{font:inherit;font-size:14px;padding:8px 10px;border-radius:8px;border:1px solid var(--ifwl-line,#c9d1dd);background:transparent;color:inherit;box-sizing:border-box;width:100%}'
    + 'textarea.ss-in{min-height:84px;resize:vertical}'
    + '.ss-url{display:flex;gap:8px;align-items:center;margin-top:8px}.ss-url code{flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--ifwl-line,#c9d1dd);font-size:13px;overflow-x:auto;white-space:nowrap}'
    + '.ss-t{border-collapse:collapse;width:100%;font-size:13px}.ss-t th,.ss-t td{padding:7px 8px;border-bottom:1px solid var(--ifwl-line,#dde3ec);text-align:left;vertical-align:top}.ss-t th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7}'
    + '.ss-pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid currentColor;margin-right:4px}.ss-off{opacity:.5}'
    + '.ss-ol{margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.5}';
  let cssDone = false;
  function mount(root) {
    if (root.__ss) return; root.__ss = true;
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    const S = { list: null, now: Date.now(), text: '', minutes: 60, big: false, busy: false, msg: '', err: false };
    const say = (m, bad) => { S.msg = m; S.err = !!bad; };
    const render = () => {
      const kp = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.in : null;
      const pos = kp && document.activeElement.selectionStart;
      const live = (S.list || []).filter((a) => a.untilMs > S.now), old = (S.list || []).filter((a) => !(a.untilMs > S.now));
      const row = (a, isLive) => '<tr class="' + (isLive ? '' : 'ss-off') + '"><td>' + esc(a.text) + '<div class="ss-sm">by ' + esc(a.byName || '') + ' · ' + esc(when(a.createdAtMs)) + '</div></td>'
        + '<td>' + (a.big ? '<span class="ss-pill">full-screen</span>' : '<span class="ss-pill">panel + ticker</span>') + '</td>'
        + '<td>' + (isLive ? 'live, ' + esc(left(a.untilMs - S.now)) + ' left' : 'ended ' + esc(when(a.untilMs))) + '</td>'
        + '<td>' + (isLive ? '<button class="btn" type="button" data-a="rm" data-id="' + esc(a.id) + '">Take off air</button>' : '') + '</td></tr>';
      root.innerHTML =
        '<div class="ss-box"><h4>Add the overlay to OBS</h4><div class="ss-sm">The overlay is a transparent web page that sits on top of your race videos: a scrolling feed along the bottom plus panels that slide in (new drivers, licence changes, this week\'s boards, upcoming races) and full-screen cards now and then.</div>'
        + '<div class="ss-url"><code id="ssUrl">' + esc(OVERLAY) + '</code><button class="btn" type="button" data-a="copy">Copy</button></div>'
        + '<ol class="ss-ol"><li>In OBS add a <b>Browser</b> source above your video and paste the link. Width <b>1920</b>, height <b>1080</b>. Leave the custom CSS as it is (the page is transparent).</li>'
        + '<li>Put your race videos in a Media Source (or VLC source) <b>below</b> it, looping.</li>'
        + '<li>Stream at 1080p30 to Twitch as normal. The page keeps itself up to date and reloads itself every 12 hours.</li></ol>'
        + '<div class="ss-row"><a class="btn" href="' + esc(OVERLAY) + '?bg=1" target="_blank" rel="noopener">Preview with live data</a><a class="btn" href="' + esc(OVERLAY) + '?demo=1&bg=1" target="_blank" rel="noopener">Preview with demo data</a></div>'
        + '<div class="ss-sm" style="margin-top:8px">Optional link settings, added to the end: <code>?gap=22</code> seconds between panels, <code>&amp;full=10</code> minutes between full-screen cards, <code>&amp;speed=95</code> ticker speed, <code>&amp;trans=wipe,slide,rise,zoom</code> which transitions to use (try just <code>wipe</code> for left to right every time).</div></div>'
        + '<div class="ss-box"><h4>Put a message on the stream</h4><div class="ss-sm">It goes on screen within about 15 seconds: as a panel and in the ticker, and repeats every few minutes while it is live.</div>'
        + '<div class="ss-row"><div style="flex:1;min-width:260px"><textarea class="ss-in" data-in="text" maxlength="200" placeholder="e.g. Monday Funday Round 7 starts at 8pm UK. Sign up on the Licence Hub!">' + esc(S.text) + '</textarea><div class="ss-sm"><span id="ssCnt">' + S.text.length + '</span> / 200</div></div></div>'
        + '<div class="ss-row"><div><label class="ss-sm">How long</label><select class="ss-in" data-in="minutes" style="width:auto">'
        + [[30, '30 minutes'], [60, '1 hour'], [180, '3 hours'], [360, '6 hours'], [720, '12 hours'], [1440, '24 hours'], [4320, '3 days']].map((o) => '<option value="' + o[0] + '"' + (S.minutes === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>'
        + '<label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" data-in="big"' + (S.big ? ' checked' : '') + '> Full-screen takeover</label>'
        + '<button class="btn primary" type="button" data-a="add"' + (S.busy ? ' disabled' : '') + '>Put on stream</button></div></div>'
        + (S.msg ? '<div class="' + (S.err ? 'ss-bad' : 'ss-good') + '" style="margin:8px 0">' + esc(S.msg) + '</div>' : '')
        + '<div class="ss-box"><h4>On air now (' + live.length + ')</h4>' + (live.length ? '<table class="ss-t"><thead><tr><th>Message</th><th>Style</th><th>Status</th><th></th></tr></thead><tbody>' + live.map((a) => row(a, true)).join('') + '</tbody></table>' : '<div class="ss-sm">Nothing right now.</div>') + '</div>'
        + (old.length ? '<div class="ss-box"><h4>Recently ended</h4><table class="ss-t"><tbody>' + old.slice(0, 8).map((a) => row(a, false)).join('') + '</tbody></table></div>' : '');
      if (kp) { const el = root.querySelector('[data-in="' + kp + '"]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* select/checkbox */ } } }
    };
    const load = async () => { try { const d = await api('staffStreamList'); S.list = d.announcements || []; S.now = d.now || Date.now(); } catch (e) { say(e.message, true); } render(); };
    root.addEventListener('input', (ev) => {
      const el = ev.target.closest('[data-in]'); if (!el) return;
      if (el.dataset.in === 'text') { S.text = el.value; const c = root.querySelector('#ssCnt'); if (c) c.textContent = S.text.length; }
    });
    root.addEventListener('change', (ev) => {
      const el = ev.target.closest('[data-in]'); if (!el) return;
      if (el.dataset.in === 'minutes') S.minutes = Number(el.value); if (el.dataset.in === 'big') S.big = el.checked;
    });
    root.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || S.busy) return; const a = b.dataset.a;
      try {
        if (a === 'copy') { try { await navigator.clipboard.writeText(OVERLAY); say('Link copied.'); } catch (e) { say('Select the link and copy it.', true); } render(); return; }
        if (a === 'add') {
          if (S.text.trim().length < 3) { say('Type the message first.', true); render(); return; }
          S.busy = true; say(''); render();
          const d = await api('staffStreamAnnounceAdd', { text: S.text.trim(), minutes: S.minutes, big: S.big });
          S.list = d.announcements || []; S.now = Date.now(); S.text = ''; S.big = false; say('On the stream. It will appear within about 15 seconds.');
        }
        if (a === 'rm') {
          if (!confirm('Take this message off the stream?')) return;
          S.busy = true; render();
          const d = await api('staffStreamAnnounceRemove', { id: b.dataset.id });
          S.list = d.announcements || []; S.now = Date.now(); say('Taken off air.');
        }
      } catch (e) { say(e.message, true); }
      S.busy = false; render();
    });
    render(); load();
  }
  function boot() { document.querySelectorAll('[data-streamstaff]').forEach((el) => { if (!el.__ss && token()) mount(el); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('ifwl-auth-changed', boot);
  window.IFWL_StreamStaff = { mount };
})();
