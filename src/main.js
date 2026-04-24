import './style.css';
import { createClient } from '@supabase/supabase-js';

try {
  const stored = localStorage.getItem('rockDispatch_theme');
  document.documentElement.dataset.theme = stored === 'light' ? 'light' : 'dark';
} catch (e) {
  document.documentElement.dataset.theme = 'dark';
}

const baseTemplates = [
      {
        id: 4,
        name: 'North Ridge — 2″ clean + rip rap',
        category: 'Rip rap',
        amount: 15240,
        status: 'Approved',
        customer: 'North Ridge Contractors',
        project: 'Channel stabilization',
        issueDate: '2026-04-15',
        validThrough: '2026-05-01',
        terms: 'Net 30',
        description: 'Heavy stone for erosion control with mixed lift heights and traffic control at the laydown.',
        specs: ['QC photos each lift', 'Geo fabric by others', 'Flaggers booked'],
        lineItems: [
          { description: 'Class II rip rap', qty: 420, unit: 'ton', rate: 38 },
          { description: '2″ clean bedding', qty: 180, unit: 'ton', rate: 29 },
          { description: 'Lowboy / oversize permit', qty: 1, unit: 'lot', rate: 1200 }
        ]
      },
      {
        id: 5,
        name: 'Prairie — Mass excavation export',
        category: 'Excavation',
        amount: 22880,
        status: 'Draft',
        customer: 'Prairie Commercial',
        project: 'Cut/fill balance — phase 2',
        issueDate: '2026-04-21',
        validThrough: '2026-05-08',
        terms: 'Progress billing',
        description: 'Export / import balance with pit destinations pre-auth’d and daily ton caps.',
        specs: ['Scale tickets matched to haul slips', 'Moisture variance tolerance set', 'Alternate pit if queue > 45 min'],
        lineItems: [
          { description: 'Off-haul to permitted pit', qty: 950, unit: 'ton', rate: 9.25 },
          { description: 'Import borrow — structural fill', qty: 620, unit: 'ton', rate: 11.5 },
          { description: 'Track hoe spotter time', qty: 30, unit: 'hr', rate: 95 }
        ]
      },
      {
        id: 6,
        name: 'Local — Same-day surge loads',
        category: 'Service',
        amount: 2860,
        status: 'Draft',
        customer: 'Local Property Group',
        project: 'Parking lot patch',
        issueDate: '2026-04-22',
        validThrough: '2026-04-24',
        terms: 'Due on receipt',
        description: 'Small ticket with truck minimums—built for quick dispatcher turnaround.',
        specs: ['Single pit unless queue spikes', 'Standby rate after 2 hours'],
        lineItems: [
          { description: 'Truck minimum / dispatch', qty: 1, unit: 'lot', rate: 350 },
          { description: '3/4″ minus patch stone', qty: 42, unit: 'ton', rate: 28 },
          { description: 'After-hours premium', qty: 3, unit: 'hr', rate: 95 }
        ]
      }
    ];

    const STORAGE_SCALE = 'rockDispatch_scaleTickets_v1';
    const STORAGE_ORDERS = 'rockDispatch_dailyOrders_v1';
    const STORAGE_SALES_ORDERS = 'rockDispatch_salesOrders_v1';
    const STORAGE_CUSTOMER_ACCOUNTS = 'rockDispatch_customerAccounts_v1';
    const STORAGE_TRUCK_TARES = 'rockDispatch_truckTares_v1';
    const STORAGE_PROFILE_DISPLAY_PREFIX = 'rockDispatch_profileDisplayName:v1:';

    function readStoredProfileDisplayName(uid) {
      if (!uid) return null;
      try {
        const v = localStorage.getItem(STORAGE_PROFILE_DISPLAY_PREFIX + uid);
        if (typeof v !== 'string') return null;
        const t = v.trim();
        return t.length ? t : null;
      } catch {
        return null;
      }
    }

    function writeStoredProfileDisplayName(uid, name) {
      if (!uid) return;
      try {
        const key = STORAGE_PROFILE_DISPLAY_PREFIX + uid;
        const trimmed = typeof name === 'string' ? name.trim() : '';
        if (trimmed) localStorage.setItem(key, trimmed);
        else localStorage.removeItem(key);
      } catch (e) {
        console.warn('[Rock Dispatch] Could not cache display name locally.', e);
      }
    }

    function seedLocalBaseTemplates() {
      return structuredClone(baseTemplates).map((b) => ({
        ...b,
        userId: null,
        tid: `base:${b.id}`
      }));
    }

    const state = {
      templates: seedLocalBaseTemplates(),
      filters: ['All', 'Base', 'Concrete', 'Equipment', 'Rip rap', 'Excavation', 'Service'],
      feedTab: 'All loads',
      feedTabs: ['All loads', 'Drafts', 'Pinned'],
      activeFilter: 'All',
      searchQuery: '',
      saved: new Set(),
      builderLines: [],
      currentView: 'homeView',
      currentDetailId: null,
      authMode: 'login',
      user: null,
      session: null,
      role: 'user',
      isAdmin: false,
      profileDisplayName: null,
      issuedQuotes: [],
      scaleTickets: [],
      dailyOrders: [],
      deskDate: '',
      calendarView: { y: new Date().getFullYear(), m: new Date().getMonth() },
      ordersBoardDate: '',
      ordersCalendarView: { y: new Date().getFullYear(), m: new Date().getMonth() },
      ordersCalendarCollapsed: false,
      salesOrders: [],
      customerAccounts: [],
      selectedCustomerAccountId: null,
      selectedScaleCustomerAccountId: null,
      customerAccountsSearchQuery: '',
      truckTares: [],
      selectedScaleTruckTareId: null,
      truckTaresSearchQuery: ''
    };

    (function initOrdersBoardDefaults() {
      const t = new Date();
      const y = t.getFullYear();
      const m = String(t.getMonth() + 1).padStart(2, '0');
      const d = String(t.getDate()).padStart(2, '0');
      state.ordersBoardDate = `${y}-${m}-${d}`;
      state.ordersCalendarView = { y: t.getFullYear(), m: t.getMonth() };
    })();

    function templateOwnerId(t) {
      if (t.userId != null) return t.userId;
      return state.session?.user?.id || null;
    }

    function pinKeyForTemplate(t) {
      const owner = templateOwnerId(t);
      if (owner == null || t.id == null) return null;
      return `${owner}:${t.id}`;
    }

    /** Display name from Supabase Auth user_metadata (always available when signed in; survives without profiles.display_name). */
    function displayNameFromUser(user) {
      if (!user) return null;
      const m = user.user_metadata || {};
      const v = m.display_name ?? m.full_name;
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    }

    async function fetchUserProfile() {
      state.role = 'user';
      state.isAdmin = false;
      if (!supabaseClient || !state.session?.user?.id) {
        state.profileDisplayName = null;
        return;
      }
      const uid = state.session.user.id;
      const metaName =
        displayNameFromUser(state.session.user) ?? readStoredProfileDisplayName(uid);

      let { data, error } = await supabaseClient
        .from('profiles')
        .select('role, display_name')
        .eq('id', uid)
        .maybeSingle();

      if (error) {
        const msg = String(error.message || error.code || '');
        if (/display_name|column|schema/i.test(msg)) {
          const fb = await supabaseClient.from('profiles').select('role').eq('id', uid).maybeSingle();
          if (fb.error) {
            console.error(fb.error);
            state.profileDisplayName = metaName;
            return;
          }
          data = fb.data;
          error = null;
        } else {
          console.error(error);
          state.profileDisplayName = metaName;
          return;
        }
      }

      if (!data) {
        state.profileDisplayName = metaName;
        return;
      }

      state.role = data.role === 'admin' ? 'admin' : 'user';
      state.isAdmin = state.role === 'admin';

      let fromCol = null;
      if (Object.prototype.hasOwnProperty.call(data, 'display_name')) {
        const col = data.display_name;
        fromCol = typeof col === 'string' && col.trim() ? col.trim() : null;
      }
      state.profileDisplayName = fromCol ?? metaName;
    }

    const el = (id) => document.getElementById(id);

    let supabaseClient = null;

function allowPublicSignup() {
  return String(import.meta.env.VITE_ALLOW_PUBLIC_SIGNUP || '').toLowerCase() === 'true';
}

/** Project URL only: https://xxxx.supabase.co — not /rest/v1, /auth/v1, or other paths (those break auth). */
function normalizeSupabaseProjectUrl(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.pathname && u.pathname !== '/') {
      console.warn(
        '[Rock Dispatch] VITE_SUPABASE_URL should be the project root only. Stripping path:',
        u.pathname,
        '→ using',
        u.origin
      );
      return u.origin;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function initSupabase() {
  const url = normalizeSupabaseProjectUrl(import.meta.env.VITE_SUPABASE_URL || '');
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return false;
  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  });
  return true;
}

/** Synthetic email domain for username→email mapping (must match invites created in Supabase dashboard). */
function authEmailDomain() {
  const d = String(import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'users.rockdispatch.local')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  return d || 'users.rockdispatch.local';
}

/** Lowercase username: letters, digits, `.`, `_`, `-`. */
function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/**
 * If the user types an address with @, treat as legacy email login.
 * Otherwise map username → username@AUTH_DOMAIN for Supabase email/password auth.
 */
function loginIdentifierToEmail(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  const u = normalizeUsername(trimmed);
  if (!u) return '';
  return `${u}@${authEmailDomain()}`;
}

function setAuthModalDismissable(dismissable) {
  const closeBtn = document.querySelector('#authModal .auth-header .icon-btn');
  const cancelBtn = el('authCancelBtn');
  if (closeBtn) closeBtn.style.display = dismissable ? '' : 'none';
  if (cancelBtn) cancelBtn.style.display = dismissable ? '' : 'none';
}

/** Removes login modal from view (drops `.open` → display:none). Call after every successful sign-in. */
function closeAuthModal() {
  const modal = el('authModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  setAuthModalDismissable(true);
}

/** Text for the always-visible header span (Settings → Profile → Greeting name). */
function navHeaderHiText() {
  if (!supabaseClient || !state.session?.user) return '';
  const name = state.profileDisplayName?.trim();
  return name ? `Hi, ${name}` : 'Hi';
}

function updateDashboardGreeting() {
  const greet = el('homeDashboardGreeting');
  if (!greet) return;
  if (!supabaseClient || !state.session?.user) {
    greet.hidden = true;
    greet.textContent = '';
    return;
  }
  greet.hidden = false;
  const name = state.profileDisplayName?.trim();
  greet.textContent = name ? `Hi, ${name}` : 'Hi';
}

function updateAuthNav() {
  const headerGreet = el('navHeaderGreeting');
  const loginAction = el('headerMenuLoginAction');
  const logoutAction = el('headerMenuLogoutAction');
  if (!supabaseClient) {
    if (loginAction) {
      loginAction.textContent = 'Offline mode';
      loginAction.disabled = true;
    }
    if (logoutAction) logoutAction.hidden = true;
    if (headerGreet) {
      headerGreet.hidden = true;
      headerGreet.textContent = '';
    }
    updateDashboardGreeting();
    return;
  }
  if (state.session?.user) {
    if (loginAction) {
      loginAction.hidden = true;
      loginAction.disabled = false;
      loginAction.textContent = 'Login';
    }
    if (logoutAction) logoutAction.hidden = false;
    if (headerGreet) {
      headerGreet.textContent = navHeaderHiText();
      headerGreet.hidden = false;
    }
  } else {
    if (loginAction) {
      loginAction.hidden = false;
      loginAction.disabled = false;
      loginAction.textContent = 'Login';
    }
    if (logoutAction) logoutAction.hidden = true;
    if (headerGreet) {
      headerGreet.hidden = true;
      headerGreet.textContent = '';
    }
  }
  updateDashboardGreeting();
}

function closeHeaderMenu() {
  const dd = el('headerMenuDropdown');
  const btn = el('headerMenuBtn');
  if (dd) dd.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleHeaderMenu(forceOpen) {
  const dd = el('headerMenuDropdown');
  const btn = el('headerMenuBtn');
  if (!dd || !btn) return;
  const open = typeof forceOpen === 'boolean' ? forceOpen : dd.hidden;
  dd.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function resetStateAfterSignOut() {
  state.templates = seedLocalBaseTemplates();
  state.saved = new Set();
  state.issuedQuotes = [];
  state.scaleTickets = [];
  state.dailyOrders = [];
  state.salesOrders = [];
  try {
    localStorage.setItem(STORAGE_SALES_ORDERS, '[]');
  } catch (e) {}
  state.builderLines = [];
  state.user = null;
  state.session = null;
  state.role = 'user';
  state.isAdmin = false;
  state.profileDisplayName = null;
  navigate('/', { replace: true });
}

async function loadCloudData() {
  await Promise.all([
    pullDeskFromSupabase(),
    pullTemplatesFromSupabase(),
    pullIssuedFromSupabase(),
    pullPinsFromSupabase()
  ]);
}

async function signOutUser() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showToast(error.message);
    return;
  }
}

    function mapScaleFromDb(row) {
      return {
        id: row.id,
        date: row.ticket_date,
        truck: row.truck,
        ticket: row.ticket,
        netTons: Number(row.net_tons),
        material: row.material,
        time: row.time_text,
        notes: row.notes || '',
        customer: row.customer ?? '',
        job: row.job ?? '',
        tonsOrdered: row.tons_ordered != null ? Number(row.tons_ordered) : 0,
        loads: Number(row.loads) || 0,
        status: row.status || 'Scheduled'
      };
    }

    function mapOrderFromDb(row) {
      return {
        id: row.id,
        date: row.order_date,
        customer: row.customer,
        job: row.job,
        material: row.material,
        tons: Number(row.tons),
        loads: Number(row.loads) || 0,
        status: row.status,
        notes: row.notes || ''
      };
    }

    async function pullDeskFromSupabase() {
      const [stRes, ordRes] = await Promise.all([
        supabaseClient.from('scale_tickets').select('*').order('ticket_date', { ascending: false }),
        supabaseClient.from('daily_orders').select('*').order('order_date', { ascending: false })
      ]);
      if (stRes.error) throw stRes.error;
      if (ordRes.error) throw ordRes.error;
      state.scaleTickets = (stRes.data || []).map(mapScaleFromDb);
      state.dailyOrders = (ordRes.data || []).map(mapOrderFromDb);
    }

    async function sbUpsertScale(t) {
      if (!supabaseClient) return;
      const row = {
        id: t.id,
        ticket_date: t.date,
        truck: t.truck,
        ticket: t.ticket || '',
        net_tons: Number(t.netTons),
        material: t.material,
        time_text: String(t.time),
        notes: t.notes || '',
        customer: t.customer || '',
        job: t.job || '',
        tons_ordered: Number(t.tonsOrdered) || 0,
        loads: parseInt(String(t.loads), 10) || 0,
        status: t.status || 'Scheduled'
      };
      const { error } = await supabaseClient.from('scale_tickets').upsert(row);
      if (error) console.error(error);
    }

    async function sbDeleteScale(id) {
      if (!supabaseClient) return;
      const { error } = await supabaseClient.from('scale_tickets').delete().eq('id', id);
      if (error) console.error(error);
    }

    async function sbUpsertOrder(o) {
      if (!supabaseClient) return;
      const row = {
        id: o.id,
        order_date: o.date,
        customer: o.customer,
        job: o.job,
        material: o.material,
        tons: Number(o.tons),
        loads: parseInt(String(o.loads), 10) || 0,
        status: o.status,
        notes: o.notes || ''
      };
      const { error } = await supabaseClient.from('daily_orders').upsert(row);
      if (error) console.error(error);
    }

    async function sbDeleteOrder(id) {
      if (!supabaseClient) return;
      const { error } = await supabaseClient.from('daily_orders').delete().eq('id', id);
      if (error) console.error(error);
    }

    function mapTemplateFromDb(row) {
      const specs = row.specs;
      const lineItems = row.line_items;
      const uid = row.user_id;
      return {
        id: row.id,
        userId: uid,
        tid: `${uid}:${row.id}`,
        name: row.name,
        category: row.category,
        amount: Number(row.amount),
        status: row.status,
        customer: row.customer,
        project: row.project,
        issueDate: row.issue_date,
        validThrough: row.valid_through,
        terms: row.terms,
        description: row.description,
        specs: Array.isArray(specs) ? specs : [],
        lineItems: Array.isArray(lineItems) ? lineItems : []
      };
    }

    function mapTemplateToDb(t) {
      const uid = t.userId ?? state.session?.user?.id;
      const row = {
        id: t.id,
        name: t.name,
        category: t.category,
        amount: t.amount,
        status: t.status,
        customer: t.customer,
        project: t.project,
        issue_date: t.issueDate,
        valid_through: t.validThrough,
        terms: t.terms,
        description: t.description,
        specs: t.specs,
        line_items: t.lineItems
      };
      if (uid) row.user_id = uid;
      return row;
    }

    function mergeTemplatesFromDb(rows) {
      const uid = state.session?.user?.id;
      if (!uid) return;

      if (state.isAdmin && rows && rows.length) {
        const mapped = rows.map(mapTemplateFromDb).sort((a, b) => b.id - a.id);
        const bases = seedLocalBaseTemplates();
        state.templates = [...bases, ...mapped];
        return;
      }

      if (!rows || !rows.length) {
        state.templates = seedLocalBaseTemplates();
        return;
      }

      const ownRows = rows.filter((r) => r.user_id === uid);
      const fromDb = new Map(ownRows.map((r) => [r.id, mapTemplateFromDb(r)]));
      const merged = structuredClone(baseTemplates).map((base) => {
        if (fromDb.has(base.id)) {
          return fromDb.get(base.id);
        }
        return {
          ...base,
          userId: null,
          tid: `base:${base.id}`
        };
      });
      for (const [, t] of fromDb) {
        if (!merged.some((x) => x.id === t.id)) merged.push(t);
      }
      merged.sort((a, b) => b.id - a.id);
      state.templates = merged;
    }

    async function pullTemplatesFromSupabase() {
      const { data, error } = await supabaseClient.from('load_templates').select('*');
      if (error) throw error;
      mergeTemplatesFromDb(data || []);
    }

    async function sbUpsertTemplate(t) {
      if (!supabaseClient) return;
      const { error } = await supabaseClient.from('load_templates').upsert(mapTemplateToDb(t));
      if (error) console.error(error);
    }

    async function pullIssuedFromSupabase() {
      const { data, error } = await supabaseClient
        .from('issued_quotes')
        .select('*')
        .order('quote_date', { ascending: false });
      if (error) throw error;
      state.issuedQuotes = (data || []).map((r) => ({
        id: r.id,
        customer: r.customer,
        total: r.total_display,
        when: r.quote_date || (r.created_at ? String(r.created_at).slice(0, 10) : '')
      }));
    }

    async function sbInsertIssuedQuote(q) {
      if (!supabaseClient) return;
      const { error } = await supabaseClient.from('issued_quotes').insert({
        id: q.id,
        customer: q.customer,
        total_display: q.total,
        quote_date: q.when
      });
      if (error) console.error(error);
    }

    async function pullPinsFromSupabase() {
      const { data, error } = await supabaseClient
        .from('pinned_template_ids')
        .select('template_id, template_owner_id');
      if (error) throw error;
      state.saved = new Set(
        (data || []).map((r) => `${r.template_owner_id}:${r.template_id}`)
      );
    }

    async function sbSyncPinnedTemplate(templateId, templateOwnerId, pinned) {
      if (!supabaseClient) return;
      if (pinned) {
        const { error } = await supabaseClient
          .from('pinned_template_ids')
          .upsert({ template_id: templateId, template_owner_id: templateOwnerId });
        if (error) console.error(error);
      } else {
        const { error } = await supabaseClient
          .from('pinned_template_ids')
          .delete()
          .eq('template_id', templateId)
          .eq('template_owner_id', templateOwnerId);
        if (error) console.error(error);
      }
    }

    function isoFromDate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function parseISODateLocal(s) {
      const [y, mo, d] = s.split('-').map(Number);
      return new Date(y, mo - 1, d);
    }

    const CENTRAL_TZ = 'America/Chicago';

    /** Current clock in US Central, formatted for `<input type="time">` (24h HH:mm). */
    function nowCentralTimeHHMM() {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CENTRAL_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(new Date());
      const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
      const minute = parts.find((p) => p.type === 'minute')?.value ?? '0';
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    /** Keep scale time aligned to live US Central while on the desk view (pause while the time input is focused). */
    function syncScaleTimeLiveToCentral() {
      if (state.currentView !== 'deskView') return;
      const input = el('scaleTime');
      if (!input) return;
      if (document.activeElement === input) return;
      input.value = nowCentralTimeHHMM();
    }

    /** Next integer ticket # for this working date (starts at 1). Only all-digit stored tickets count toward the max. */
    function nextScaleTicketNumberForDate(iso) {
      let max = 0;
      for (const t of state.scaleTickets) {
        if (t.date !== iso) continue;
        const s = String(t.ticket ?? '').trim();
        if (/^\d+$/.test(s)) {
          const n = parseInt(s, 10);
          if (n > max) max = n;
        }
      }
      return max + 1;
    }

    function autofillScaleTicketNumber() {
      if (state.currentView !== 'deskView') return;
      const input = el('scaleTicket');
      if (!input) return;
      if (document.activeElement === input) return;
      input.value = String(nextScaleTicketNumberForDate(state.deskDate));
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function loadDeskStorage() {
      try {
        const s = localStorage.getItem(STORAGE_SCALE);
        const o = localStorage.getItem(STORAGE_ORDERS);
        if (s) state.scaleTickets = JSON.parse(s);
        if (o) state.dailyOrders = JSON.parse(o);
      } catch (e) {}
    }

    function persistDesk() {
      try {
        localStorage.setItem(STORAGE_SCALE, JSON.stringify(state.scaleTickets));
        localStorage.setItem(STORAGE_ORDERS, JSON.stringify(state.dailyOrders));
      } catch (e) {}
    }

    function initDeskDate() {
      const t = new Date();
      state.deskDate = isoFromDate(t);
      state.calendarView = { y: t.getFullYear(), m: t.getMonth() };
    }

    function seedDeskIfEmpty() {
      if (supabaseClient) return;
      if (state.scaleTickets.length || state.dailyOrders.length) return;
      const today = isoFromDate(new Date());
      const prior = isoFromDate(new Date(Date.now() - 86400000));
      state.scaleTickets.push(
        {
          id: 'S-seed-1',
          date: today,
          truck: 'T-104',
          ticket: 'SC-9081',
          netTons: 24.6,
          material: '3/4 clean',
          time: '06:42',
          notes: '',
          customer: 'North Ridge',
          job: 'Channel work',
          tonsOrdered: 24,
          loads: 1,
          status: 'Loading'
        },
        {
          id: 'S-seed-2',
          date: today,
          truck: 'T-212',
          ticket: 'SC-9082',
          netTons: 25.1,
          material: '1-1/2 base',
          time: '07:05',
          notes: 'Moisture OK',
          customer: 'Prairie Commercial',
          job: 'Export pad',
          tonsOrdered: 25,
          loads: 1,
          status: 'Scheduled'
        }
      );
      state.dailyOrders.push(
        { id: 'O-seed-1', date: today, customer: 'Summit Civil', job: 'County shoulder', material: '3/4 clean', tons: 260, loads: 11, status: 'Scheduled', notes: 'PM pour' },
        { id: 'O-seed-2', date: prior, customer: 'Riverstone Paving', job: 'Trail pad', material: 'Sand', tons: 120, loads: 5, status: 'Delivered', notes: '' }
      );
      persistDesk();
    }

    function dayHasData(iso) {
      const hasS = state.scaleTickets.some((t) => t.date === iso);
      const hasO = state.dailyOrders.some((o) => o.date === iso);
      return hasS || hasO;
    }

    function setDeskDate(iso) {
      if (!iso) return;
      state.deskDate = iso;
      const d = parseISODateLocal(iso);
      state.calendarView = { y: d.getFullYear(), m: d.getMonth() };
      const picker = el('deskDatePicker');
      if (picker) picker.value = iso;
      renderDesk();
    }

    function deskGoToToday() {
      setDeskDate(isoFromDate(new Date()));
    }

    function deskMonthNav(delta) {
      let y = state.calendarView.y;
      let m = state.calendarView.m + delta;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      if (m > 11) {
        m = 0;
        y += 1;
      }
      state.calendarView = { y, m };
      renderMiniCalendar();
    }

    function loadSalesOrdersStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_SALES_ORDERS);
        if (raw) state.salesOrders = JSON.parse(raw);
      } catch (e) {}
    }

    function persistSalesOrders() {
      try {
        localStorage.setItem(STORAGE_SALES_ORDERS, JSON.stringify(state.salesOrders));
      } catch (e) {}
    }

    function loadCustomerAccountsStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_CUSTOMER_ACCOUNTS);
        if (raw) state.customerAccounts = JSON.parse(raw);
        if (!Array.isArray(state.customerAccounts)) state.customerAccounts = [];
      } catch (e) {
        state.customerAccounts = [];
      }
      if (!state.customerAccounts.length) {
        state.customerAccounts = [{ id: 'CA-COD', name: 'COD' }];
        persistCustomerAccounts();
      }
    }

    function persistCustomerAccounts() {
      try {
        localStorage.setItem(STORAGE_CUSTOMER_ACCOUNTS, JSON.stringify(state.customerAccounts));
        return true;
      } catch (e) {}
      return false;
    }

    function loadTruckTaresStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_TRUCK_TARES);
        if (raw) state.truckTares = JSON.parse(raw);
        if (!Array.isArray(state.truckTares)) state.truckTares = [];
      } catch (e) {
        state.truckTares = [];
      }
    }

    function persistTruckTares() {
      try {
        localStorage.setItem(STORAGE_TRUCK_TARES, JSON.stringify(state.truckTares));
        return true;
      } catch (e) {}
      return false;
    }

    function setTheme(theme) {
      const t = theme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      try {
        localStorage.setItem('rockDispatch_theme', t);
      } catch (e) {}
      syncThemeRadios();
    }

    function syncThemeRadios() {
      const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      document.querySelectorAll('input[name="appTheme"]').forEach((r) => {
        r.checked = r.value === cur;
      });
    }

    function accountHintText() {
      return state.customerAccounts.length
        ? 'Search and select a customer account.'
        : 'No accounts yet — add customer accounts on Customer Accounts page.';
    }

    function clearAccountSelection() {
      state.selectedCustomerAccountId = null;
      const hid = el('soAccountId');
      const search = el('soAccountSearch');
      const hint = el('soAccountHint');
      if (hid) hid.value = '';
      if (search) search.value = '';
      if (hint) hint.textContent = accountHintText();
      const dd = el('soAccountDropdown');
      if (dd) dd.hidden = true;
    }

    function clearScaleAccountSelection() {
      state.selectedScaleCustomerAccountId = null;
      const hid = el('scaleAccountId');
      const search = el('scaleAccountSearch');
      const hint = el('scaleAccountHint');
      if (hid) hid.value = '';
      if (search) search.value = '';
      if (hint) hint.textContent = accountHintText();
      const dd = el('scaleAccountDropdown');
      if (dd) dd.hidden = true;
    }

    function clearScaleTruckSelection() {
      state.selectedScaleTruckTareId = null;
      const hid = el('scaleTruckTareId');
      const search = el('scaleTruckSearch');
      const hint = el('scaleTruckHint');
      if (hid) hid.value = '';
      if (search) search.value = '';
      if (hint)
        hint.textContent = state.truckTares.length
          ? 'Search and select a stored truck tare, or type a truck number.'
          : 'No stored truck tares yet — add one on Stored Truck Tares page.';
      const dd = el('scaleTruckDropdown');
      if (dd) dd.hidden = true;
    }

    function getFilteredCustomerAccounts(query) {
      const q = String(query || '').trim().toLowerCase();
      return state.customerAccounts.filter((a) => !q || a.name.toLowerCase().includes(q));
    }

    function getFilteredTruckTares(query) {
      const q = String(query || '').trim().toLowerCase();
      return state.truckTares.filter((t) => {
        if (!q) return true;
        const truck = String(t.truck || '').toLowerCase();
        const company = String(t.companyName || '').toLowerCase();
        return truck.includes(q) || company.includes(q);
      });
    }

    function renderAccountDropdown() {
      const dd = el('soAccountDropdown');
      if (!dd) return;
      const items = getFilteredCustomerAccounts(el('soAccountSearch')?.value || '');
      dd.innerHTML = '';
      items.forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'account-option';
        btn.setAttribute('role', 'option');
        btn.dataset.id = a.id;
        btn.textContent = a.name;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectCustomerAccount(a.id);
        });
        dd.appendChild(btn);
      });
      dd.hidden = items.length === 0;
    }

    function renderScaleAccountDropdown() {
      const dd = el('scaleAccountDropdown');
      if (!dd) return;
      const items = getFilteredCustomerAccounts(el('scaleAccountSearch')?.value || '');
      dd.innerHTML = '';
      items.forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'account-option';
        btn.setAttribute('role', 'option');
        btn.dataset.id = a.id;
        btn.textContent = a.name;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectScaleCustomerAccount(a.id);
        });
        dd.appendChild(btn);
      });
      dd.hidden = items.length === 0;
    }

    function renderScaleTruckDropdown() {
      const dd = el('scaleTruckDropdown');
      if (!dd) return;
      const items = getFilteredTruckTares(el('scaleTruckSearch')?.value || '');
      dd.innerHTML = '';
      items.forEach((t) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'account-option';
        btn.setAttribute('role', 'option');
        btn.dataset.id = t.id;
        const company = String(t.companyName || '').trim();
        btn.textContent = company
          ? `${t.truck} · ${company} · tare ${Number(t.tareWeight).toFixed(2)}`
          : `${t.truck} · tare ${Number(t.tareWeight).toFixed(2)}`;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectScaleTruckTare(t.id);
        });
        dd.appendChild(btn);
      });
      dd.hidden = items.length === 0;
    }

    function selectCustomerAccount(id) {
      const acc = state.customerAccounts.find((x) => x.id === id);
      if (!acc) return;
      state.selectedCustomerAccountId = id;
      const hid = el('soAccountId');
      const search = el('soAccountSearch');
      const hint = el('soAccountHint');
      if (hid) hid.value = id;
      if (search) search.value = acc.name;
      if (hint) hint.textContent = `Selected: ${acc.name}`;
      const dd = el('soAccountDropdown');
      if (dd) dd.hidden = true;
    }

    function selectScaleCustomerAccount(id) {
      const acc = state.customerAccounts.find((x) => x.id === id);
      if (!acc) return;
      state.selectedScaleCustomerAccountId = id;
      const hid = el('scaleAccountId');
      const search = el('scaleAccountSearch');
      const hint = el('scaleAccountHint');
      if (hid) hid.value = id;
      if (search) search.value = acc.name;
      if (hint) hint.textContent = `Selected: ${acc.name}`;
      const dd = el('scaleAccountDropdown');
      if (dd) dd.hidden = true;
    }

    function selectScaleTruckTare(id) {
      const t = state.truckTares.find((x) => x.id === id);
      if (!t) return;
      state.selectedScaleTruckTareId = id;
      const hid = el('scaleTruckTareId');
      const search = el('scaleTruckSearch');
      const hint = el('scaleTruckHint');
      if (hid) hid.value = id;
      if (search) search.value = t.truck;
      if (hint) {
        const company = String(t.companyName || '').trim();
        hint.textContent = company
          ? `Selected: ${t.truck} (${company}, tare ${Number(t.tareWeight).toFixed(2)})`
          : `Selected: ${t.truck} (tare ${Number(t.tareWeight).toFixed(2)})`;
      }
      const tareEl = el('scaleTareWeight');
      if (tareEl && document.activeElement !== tareEl) tareEl.value = Number(t.tareWeight).toFixed(2);
      syncScaleMaterialWeight();
      const dd = el('scaleTruckDropdown');
      if (dd) dd.hidden = true;
    }

    function renderSettingsPage() {
      if (!el('settingsPanelAppearance')) return;
      syncThemeRadios();

      const hasCloud = !!supabaseClient;
      const loggedIn = !!(state.session?.user);

      const offline = el('settingsProfileOffline');
      const signedOut = el('settingsProfileSignedOut');
      const signedIn = el('settingsProfileSignedIn');
      const emailEl = el('settingsEmailDisplay');
      if (offline) offline.hidden = hasCloud;
      if (signedOut) signedOut.hidden = !hasCloud || loggedIn;
      if (signedIn) signedIn.hidden = !hasCloud || !loggedIn;
      if (loggedIn && emailEl) {
        emailEl.textContent = state.session.user.email || '—';
      }

      const greetInp = el('settingsGreetingNameInput');
      const greetPreview = el('settingsGreetingPreview');
      if (loggedIn && greetInp && document.activeElement !== greetInp) {
        greetInp.value = state.profileDisplayName ?? '';
      }
      if (greetPreview && loggedIn) {
        const raw = (greetInp?.value ?? '').trim();
        const show = raw || state.profileDisplayName?.trim();
        greetPreview.textContent = show
          ? `Header & home will show: Hi, ${show}`
          : 'Header & home will show: Hi — enter a greeting above and save.';
      }

      const adminBadge = el('settingsProfileAdminBadge');
      if (adminBadge) adminBadge.hidden = true;
    }

    async function saveGreetingName() {
      if (!supabaseClient || !state.session?.user?.id) {
        showToast('Sign in to save your greeting.');
        return;
      }
      const uid = state.session.user.id;
      const inp = el('settingsGreetingNameInput');
      const raw = (inp?.value ?? '').trim();
      const display_name = raw.length ? raw : null;

      const { data: authUpdateData, error: authErr } = await supabaseClient.auth.updateUser({
        data: { display_name }
      });

      if (authUpdateData?.user && state.session) {
        state.session = { ...state.session, user: authUpdateData.user };
        state.user = authUpdateData.user;
      } else {
        const { data: sessionWrap } = await supabaseClient.auth.getSession();
        if (sessionWrap?.session) {
          state.session = sessionWrap.session;
          state.user = sessionWrap.session.user;
        }
      }

      const res = await supabaseClient
        .from('profiles')
        .upsert({ id: uid, display_name }, { onConflict: 'id' })
        .select('display_name')
        .maybeSingle();

      if (authErr && res.error) {
        console.error(authErr, res.error);
        const hint =
          /display_name|column|policy|permission|RLS|row-level|violates/i.test(String(res.error.message || ''))
            ? ' If the database is not migrated, your project still needs profiles policies; auth save should work after refresh.'
            : '';
        showToast((authErr.message || res.error.message || 'Could not save greeting.') + hint);
        return;
      }

      if (authErr) console.warn('[Rock Dispatch] Saved greeting to profiles; auth metadata failed:', authErr);
      if (res.error)
        console.warn(
          '[Rock Dispatch] Saved greeting to auth metadata; profiles upsert failed (run migrations if you need DB copy):',
          res.error
        );

      writeStoredProfileDisplayName(uid, raw.length ? raw : null);

      state.profileDisplayName =
        raw.length ? raw : displayNameFromUser(state.session.user) ?? readStoredProfileDisplayName(uid);
      await fetchUserProfile();
      updateAuthNav();
      updateDashboardGreeting();
      renderSettingsPage();
      showToast('Greeting saved.', 3500);
    }

    async function changeProfilePassword() {
      if (!supabaseClient || !state.session?.user?.email) {
        showToast('Sign in to change your password.');
        return;
      }
      const curEl = el('settingsCurrentPassword');
      const newEl = el('settingsNewPassword');
      const confEl = el('settingsConfirmPassword');
      const current = curEl?.value ?? '';
      const next = newEl?.value ?? '';
      const confirm = confEl?.value ?? '';

      if (!current.length) {
        showToast('Enter your current password.');
        return;
      }
      if (!next.length) {
        showToast('Enter a new password.');
        return;
      }
      if (next.length < 6) {
        showToast('New password must be at least 6 characters.');
        return;
      }
      if (next !== confirm) {
        showToast('New password and confirmation do not match.');
        return;
      }
      if (next === current) {
        showToast('Choose a different password than your current one.');
        return;
      }

      const email = state.session.user.email;
      const { data: signData, error: verifyErr } = await supabaseClient.auth.signInWithPassword({
        email,
        password: current
      });

      if (verifyErr || !signData?.session) {
        showToast('Current password is incorrect.');
        return;
      }

      state.session = signData.session;
      state.user = signData.user ?? signData.session.user;

      const { data: pwdData, error: pwdErr } = await supabaseClient.auth.updateUser({
        password: next
      });

      if (pwdErr) {
        console.error(pwdErr);
        showToast(pwdErr.message || 'Could not update password.');
        return;
      }

      if (pwdData?.user && state.session) {
        state.session = { ...state.session, user: pwdData.user };
        state.user = pwdData.user;
      } else {
        const { data: sessionWrap } = await supabaseClient.auth.getSession();
        if (sessionWrap?.session) {
          state.session = sessionWrap.session;
          state.user = sessionWrap.session.user;
        }
      }

      if (curEl) curEl.value = '';
      if (newEl) newEl.value = '';
      if (confEl) confEl.value = '';
      showToast('Password updated.', 4000);
    }

    function renderCustomerAccountsList() {
      const wrap = el('customerAccountsList');
      if (!wrap) return;
      const q = String(state.customerAccountsSearchQuery || '').trim().toLowerCase();
      const rows = state.customerAccounts.filter((a) => !q || a.name.toLowerCase().includes(q));
      if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">No customer accounts yet. Add one above.</div>';
        return;
      }
      wrap.innerHTML = '';
      rows.forEach((a) => {
        const row = document.createElement('div');
        row.className = 'settings-account-row';
        row.innerHTML = `
          <span class="name">${escapeHtml(a.name)}</span>
          <div class="settings-account-actions">
            <button type="button" class="ghost-btn mini-remove" data-edit="${escapeHtml(a.id)}">Rename</button>
            <button type="button" class="ghost-btn mini-remove" data-del="${escapeHtml(a.id)}">Delete</button>
          </div>
        `;
        row.querySelector('[data-edit]')?.addEventListener('click', () => renameCustomerAccount(a.id));
        row.querySelector('[data-del]')?.addEventListener('click', () => deleteCustomerAccount(a.id));
        wrap.appendChild(row);
      });
    }

    function addCustomerAccount() {
      const inp = el('newAccountName');
      const name = inp?.value.trim() ?? '';
      if (!name) {
        showToast('Enter an account name.');
        return;
      }
      if (state.customerAccounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
        showToast('That account name already exists.');
        return;
      }
      state.customerAccounts.push({ id: `CA-${Date.now()}`, name });
      if (!persistCustomerAccounts()) {
        showToast('Could not save customer accounts in local storage.');
        return;
      }
      loadCustomerAccountsStorage();
      if (inp) inp.value = '';
      renderCustomerAccountsList();
      renderAccountDropdown();
      renderScaleAccountDropdown();
      clearAccountSelection();
      clearScaleAccountSelection();
      showToast('Customer account added.');
    }

    function renameCustomerAccount(id) {
      const a = state.customerAccounts.find((x) => x.id === id);
      if (!a) return;
      const next = window.prompt('Rename customer account', a.name);
      if (next == null) return;
      const name = next.trim();
      if (!name) {
        showToast('Name cannot be empty.');
        return;
      }
      a.name = name;
      persistCustomerAccounts();
      loadCustomerAccountsStorage();
      renderCustomerAccountsList();
      renderAccountDropdown();
      renderScaleAccountDropdown();
      if (state.selectedCustomerAccountId === id) selectCustomerAccount(id);
      if (state.selectedScaleCustomerAccountId === id) selectScaleCustomerAccount(id);
      showToast('Account updated.');
    }

    function deleteCustomerAccount(id) {
      if (!window.confirm('Delete this customer account? Existing orders keep the name they had when saved.')) return;
      state.customerAccounts = state.customerAccounts.filter((a) => a.id !== id);
      persistCustomerAccounts();
      loadCustomerAccountsStorage();
      renderCustomerAccountsList();
      renderAccountDropdown();
      renderScaleAccountDropdown();
      if (state.selectedCustomerAccountId === id) clearAccountSelection();
      if (state.selectedScaleCustomerAccountId === id) clearScaleAccountSelection();
      showToast('Account removed.');
    }

    function showSettingsSection(panel) {
      const prof = el('settingsPanelProfile');
      const app = el('settingsPanelAppearance');
      const navBtns = document.querySelectorAll('.settings-nav-btn');
      navBtns.forEach((b) => {
        const active = b.dataset.settingsPanel === panel;
        b.classList.toggle('active', active);
      });
      if (prof) prof.hidden = panel !== 'profile';
      if (app) app.hidden = panel !== 'appearance';
      if (panel === 'profile') renderSettingsPage();
    }

    let settingsUiInitialized = false;
    function initSettingsNav() {
      if (settingsUiInitialized) return;
      settingsUiInitialized = true;
      document.querySelectorAll('.settings-nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => showSettingsSection(btn.dataset.settingsPanel));
      });
      document.querySelectorAll('input[name="appTheme"]').forEach((r) => {
        r.addEventListener('change', () => {
          if (r.checked) setTheme(r.value);
        });
      });
      const greetInp = el('settingsGreetingNameInput');
      if (greetInp && !greetInp.dataset.livePreview) {
        greetInp.dataset.livePreview = '1';
        greetInp.addEventListener('input', () => renderSettingsPage());
      }
    }

    function dayHasSalesOrders(iso) {
      return state.salesOrders.some((o) => o.date === iso);
    }

    function setOrdersBoardDate(iso) {
      if (!iso) return;
      state.ordersBoardDate = iso;
      const d = parseISODateLocal(iso);
      state.ordersCalendarView = { y: d.getFullYear(), m: d.getMonth() };
      const picker = el('ordersDatePicker');
      if (picker) picker.value = iso;
      renderOrdersPage();
    }

    function ordersGoToToday() {
      setOrdersBoardDate(isoFromDate(new Date()));
    }

    function ordersMonthNav(delta) {
      let y = state.ordersCalendarView.y;
      let m = state.ordersCalendarView.m + delta;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      if (m > 11) {
        m = 0;
        y += 1;
      }
      state.ordersCalendarView = { y, m };
      renderOrdersCalendar();
    }

    function toggleOrdersCalendarPanel() {
      state.ordersCalendarCollapsed = !state.ordersCalendarCollapsed;
      const aside = el('ordersCalendarAside');
      const btn = el('ordersCalToggle');
      const inner = el('ordersCalInner');
      if (aside) aside.classList.toggle('collapsed', state.ordersCalendarCollapsed);
      if (btn) {
        btn.textContent = state.ordersCalendarCollapsed ? 'Show calendar' : 'Hide calendar';
        btn.setAttribute('aria-expanded', String(!state.ordersCalendarCollapsed));
      }
      if (inner) inner.hidden = state.ordersCalendarCollapsed;
    }

    function clearSalesOrderForm() {
      clearAccountSelection();
      const n = el('soName');
      const p = el('soPhone');
      const ad = el('soAddress');
      const no = el('soNotes');
      if (n) n.value = '';
      if (p) p.value = '';
      if (ad) ad.value = '';
      if (no) no.value = '';
    }

    function addSalesOrder() {
      const accountId = el('soAccountId')?.value?.trim() ?? '';
      const accRecord = accountId ? state.customerAccounts.find((x) => x.id === accountId) : null;
      const accountName = accRecord ? accRecord.name : '';
      const name = el('soName')?.value.trim() ?? '';
      const phone = el('soPhone')?.value.trim() ?? '';
      const address = el('soAddress')?.value.trim() ?? '';
      const notes = el('soNotes')?.value.trim() ?? '';
      if (state.customerAccounts.length > 0 && !accountId) {
        showToast('Select a customer account from the list.');
        return;
      }
      if (!name && !accountName && !address) {
        showToast('Enter customer name or jobsite, or add more account details.');
        return;
      }
      const row = {
        id: `SO-${Date.now()}`,
        date: state.ordersBoardDate,
        customerAccountId: accountId,
        customerAccount: accountName,
        customerName: name,
        customerPhone: phone,
        jobsiteAddress: address,
        notes
      };
      state.salesOrders.unshift(row);
      persistSalesOrders();
      clearSalesOrderForm();
      renderOrdersPage();
      showToast('Order added.');
    }

    function removeSalesOrder(id) {
      state.salesOrders = state.salesOrders.filter((o) => o.id !== id);
      persistSalesOrders();
      renderOrdersPage();
    }

    function renderOrdersCalendar() {
      const host = el('ordersMiniCalendarHost');
      if (!host) return;

      const { y, m } = state.ordersCalendarView;
      const first = new Date(y, m, 1);
      const startPad = first.getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const todayIso = isoFromDate(new Date());

      const cells = [];
      for (let i = 0; i < startPad; i++) {
        cells.push('<button type="button" class="cal-day" disabled aria-hidden="true">&nbsp;</button>');
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isSel = iso === state.ordersBoardDate;
        const isToday = iso === todayIso;
        const has = dayHasSalesOrders(iso);
        const cls = ['cal-day'];
        if (isSel) cls.push('selected');
        if (isToday) cls.push('today');
        cells.push(
          `<button type="button" class="${cls.join(' ')}" onclick="setOrdersBoardDate('${iso}')">${d}${has ? '<span class="cal-dot"></span>' : '<span class="cal-dot" style="opacity:0;"></span>'}</button>`
        );
      }

      host.innerHTML = `
        <div class="mini-cal-head">
          <button type="button" class="cal-nav" onclick="ordersMonthNav(-1)" aria-label="Previous month">‹</button>
          <strong>${monthNames[m]} ${y}</strong>
          <button type="button" class="cal-nav" onclick="ordersMonthNav(1)" aria-label="Next month">›</button>
        </div>
        <div class="cal-weekdays"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
        <div class="cal-days">${cells.join('')}</div>
      `;
    }

    function renderSalesOrdersList() {
      const wrap = el('salesOrdersList');
      if (!wrap || !state.ordersBoardDate) return;

      const rows = state.salesOrders.filter((o) => o.date === state.ordersBoardDate);
      const pretty = parseISODateLocal(state.ordersBoardDate).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      const listLabel = el('ordersListDateLabel');
      const selLabel = el('ordersSelectedDateLabel');
      if (listLabel) listLabel.textContent = pretty;
      if (selLabel) selLabel.textContent = pretty;

      if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">No orders for this day yet.</div>';
        return;
      }
      wrap.innerHTML = '';
      rows.forEach((o) => {
        const card = document.createElement('div');
        card.className = 'sales-order-card panel box';
        const acct = o.customerAccount
          ? `<div><span class="lbl">Account</span> ${escapeHtml(o.customerAccount)}</div>`
          : '';
        const phone = o.customerPhone
          ? `<div><span class="lbl">Phone</span> ${escapeHtml(o.customerPhone)}</div>`
          : '';
        const addr = o.jobsiteAddress
          ? `<div class="span-full"><span class="lbl">Jobsite</span> ${escapeHtml(o.jobsiteAddress)}</div>`
          : '';
        const noteBlock = o.notes
          ? `<div class="span-full notes"><span class="lbl">Notes</span> ${escapeHtml(o.notes)}</div>`
          : '';
        card.innerHTML = `
          <div class="sales-order-card-head">
            <strong>${escapeHtml(o.customerName || '—')}</strong>
            <button type="button" class="ghost-btn mini-remove">Remove</button>
          </div>
          <div class="sales-order-meta">
            ${acct}
            ${phone}
            ${addr}
            ${noteBlock}
          </div>
        `;
        card.querySelector('.mini-remove').onclick = () => removeSalesOrder(o.id);
        wrap.appendChild(card);
      });
    }

    function renderOrdersPage() {
      if (!el('salesOrdersList')) return;
      const picker = el('ordersDatePicker');
      if (picker && state.ordersBoardDate) picker.value = state.ordersBoardDate;
      renderSalesOrdersList();
      renderOrdersCalendar();
      const hint = el('soAccountHint');
      if (hint && !state.selectedCustomerAccountId) hint.textContent = accountHintText();
      renderAccountDropdown();
    }

    function renderCustomerAccountsPage() {
      const search = el('customerAccountsSearchInput');
      if (search && document.activeElement !== search) {
        search.value = state.customerAccountsSearchQuery || '';
      }
      renderCustomerAccountsList();
    }

    function renderStoredTruckTaresList() {
      const wrap = el('storedTruckTaresList');
      if (!wrap) return;
      const q = String(state.truckTaresSearchQuery || '').trim().toLowerCase();
      const rows = state.truckTares.filter((t) => {
        if (!q) return true;
        const truck = String(t.truck || '').toLowerCase();
        const company = String(t.companyName || '').toLowerCase();
        return truck.includes(q) || company.includes(q);
      });
      if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">No stored truck tares yet. Add one above.</div>';
        return;
      }
      wrap.innerHTML = '';
      rows.forEach((t) => {
        const row = document.createElement('div');
        row.className = 'settings-account-row';
        row.innerHTML = `
          <span class="name">
            ${escapeHtml(t.truck)}
            <span style="color:var(--muted-2); font-weight:500;">(${escapeHtml(t.companyName || 'No company')} · tare ${Number(t.tareWeight).toFixed(2)})</span>
          </span>
          <div class="settings-account-actions">
            <button type="button" class="ghost-btn mini-remove" data-edit="${escapeHtml(t.id)}">Edit</button>
            <button type="button" class="ghost-btn mini-remove" data-del="${escapeHtml(t.id)}">Delete</button>
          </div>
        `;
        row.querySelector('[data-edit]')?.addEventListener('click', () => editStoredTruckTare(t.id));
        row.querySelector('[data-del]')?.addEventListener('click', () => deleteStoredTruckTare(t.id));
        wrap.appendChild(row);
      });
    }

    function renderStoredTruckTaresPage() {
      const search = el('truckTaresSearchInput');
      if (search && document.activeElement !== search) {
        search.value = state.truckTaresSearchQuery || '';
      }
      renderStoredTruckTaresList();
    }

    function addStoredTruckTare() {
      const truck = (el('newTruckNumber')?.value || '').trim();
      const companyName = (el('newTruckCompanyName')?.value || '').trim();
      const tareRaw = parseFloat(el('newTruckTareWeight')?.value || '');
      if (!truck || Number.isNaN(tareRaw)) {
        showToast('Enter truck number and tare weight.');
        return;
      }
      if (state.truckTares.some((t) => t.truck.toLowerCase() === truck.toLowerCase())) {
        showToast('That truck already exists. Use Edit instead.');
        return;
      }
      state.truckTares.push({ id: `TR-${Date.now()}`, truck, companyName, tareWeight: tareRaw });
      if (!persistTruckTares()) {
        showToast('Could not save stored truck tares.');
        return;
      }
      loadTruckTaresStorage();
      const tn = el('newTruckNumber');
      const tc = el('newTruckCompanyName');
      const tw = el('newTruckTareWeight');
      if (tn) tn.value = '';
      if (tc) tc.value = '';
      if (tw) tw.value = '';
      renderStoredTruckTaresList();
      renderScaleTruckDropdown();
      clearScaleTruckSelection();
      showToast('Stored truck tare added.');
    }

    function editStoredTruckTare(id) {
      const row = state.truckTares.find((t) => t.id === id);
      if (!row) return;
      const nextTruck = window.prompt('Truck number', row.truck);
      if (nextTruck == null) return;
      const truck = nextTruck.trim();
      if (!truck) {
        showToast('Truck number cannot be empty.');
        return;
      }
      const nextCompany = window.prompt('Company name', String(row.companyName || ''));
      if (nextCompany == null) return;
      const companyName = nextCompany.trim();
      const nextTare = window.prompt('Tare weight', String(row.tareWeight));
      if (nextTare == null) return;
      const tare = parseFloat(nextTare);
      if (Number.isNaN(tare)) {
        showToast('Enter a valid tare weight.');
        return;
      }
      row.truck = truck;
      row.companyName = companyName;
      row.tareWeight = tare;
      persistTruckTares();
      loadTruckTaresStorage();
      renderStoredTruckTaresList();
      renderScaleTruckDropdown();
      if (state.selectedScaleTruckTareId === id) selectScaleTruckTare(id);
      showToast('Stored truck tare updated.');
    }

    function deleteStoredTruckTare(id) {
      if (!window.confirm('Delete this stored truck tare?')) return;
      state.truckTares = state.truckTares.filter((t) => t.id !== id);
      persistTruckTares();
      loadTruckTaresStorage();
      renderStoredTruckTaresList();
      renderScaleTruckDropdown();
      if (state.selectedScaleTruckTareId === id) clearScaleTruckSelection();
      showToast('Stored truck tare removed.');
    }

    function clearScaleForm() {
      clearScaleTruckSelection();
      const tickEl = el('scaleTicket');
      if (tickEl) tickEl.value = String(nextScaleTicketNumberForDate(state.deskDate));
      clearScaleAccountSelection();
      const timeEl = el('scaleTime');
      if (timeEl) timeEl.value = nowCentralTimeHHMM();
      el('scaleTareWeight').value = '';
      el('scaleGrossWeight').value = '';
      el('scaleTotalMaterialWeight').value = '';
      el('scaleMaterial').value = '';
      el('scaleJob').value = '';
      el('scaleLoads').value = '';
      const st = el('scaleStatus');
      if (st) st.value = 'Scheduled';
      el('scaleNotes').value = '';
    }

    function addScaleTicket() {
      const truck = (el('scaleTruckSearch')?.value || '').trim();
      const tareWeight = parseFloat(el('scaleTareWeight').value);
      const grossWeight = parseFloat(el('scaleGrossWeight').value);
      const totalMaterialWeight = parseFloat(el('scaleTotalMaterialWeight').value);
      const accountId = el('scaleAccountId')?.value?.trim() ?? '';
      const accRecord = accountId ? state.customerAccounts.find((x) => x.id === accountId) : null;
      const customer = (accRecord ? accRecord.name : (el('scaleAccountSearch')?.value ?? '')).trim();
      if (!truck || Number.isNaN(tareWeight) || Number.isNaN(grossWeight) || Number.isNaN(totalMaterialWeight)) {
        showToast('Enter truck number, tare weight, and gross weight.');
        return;
      }
      if (grossWeight < tareWeight) {
        showToast('Gross Weight must be greater than or equal to Tare weight.');
        return;
      }
      if (state.customerAccounts.length > 0 && !accountId) {
        showToast('Select a customer account from the list.');
        return;
      }
      if (!customer) {
        showToast('Enter customer.');
        return;
      }
      let ticketNo = el('scaleTicket').value.trim();
      if (!ticketNo) ticketNo = String(nextScaleTicketNumberForDate(state.deskDate));
      const newTicket = {
        id: `S-${Date.now()}`,
        date: state.deskDate,
        truck,
        ticket: ticketNo,
        netTons: totalMaterialWeight,
        material: el('scaleMaterial').value.trim() || '—',
        time: el('scaleTime').value || '—',
        notes: el('scaleNotes').value.trim(),
        customer,
        job: el('scaleJob').value.trim() || '—',
        tonsOrdered: 0,
        loads: parseInt(el('scaleLoads').value, 10) || 0,
        status: el('scaleStatus').value
      };
      state.scaleTickets.unshift(newTicket);
      persistDesk();
      void sbUpsertScale(newTicket);
      clearScaleForm();
      renderDesk();
      showToast('Scale ticket logged.');
    }

    function removeScaleTicket(id) {
      state.scaleTickets = state.scaleTickets.filter((t) => t.id !== id);
      persistDesk();
      renderDesk();
      void sbDeleteScale(id);
    }

    function addDailyOrder() {
      const customer = el('orderCustomer').value.trim();
      const tons = parseFloat(el('orderTons').value);
      if (!customer || Number.isNaN(tons)) {
        showToast('Enter customer and tons ordered.');
        return;
      }
      const newOrder = {
        id: `O-${Date.now()}`,
        date: state.deskDate,
        customer,
        job: el('orderJob').value.trim() || '—',
        material: el('orderMaterial').value.trim() || '—',
        tons,
        loads: parseInt(el('orderLoads').value, 10) || 0,
        status: el('orderStatus').value,
        notes: el('orderNotes').value.trim()
      };
      state.dailyOrders.unshift(newOrder);
      persistDesk();
      void sbUpsertOrder(newOrder);
      el('orderCustomer').value = '';
      el('orderJob').value = '';
      el('orderMaterial').value = '';
      el('orderTons').value = '';
      el('orderLoads').value = '';
      el('orderStatus').value = 'Scheduled';
      el('orderNotes').value = '';
      renderDesk();
      showToast('Order added for this date.');
    }

    function removeDailyOrder(id) {
      state.dailyOrders = state.dailyOrders.filter((o) => o.id !== id);
      persistDesk();
      renderDesk();
      void sbDeleteOrder(id);
    }

    function renderScaleTable() {
      const body = el('scaleTableBody');
      if (!body) return;
      body.innerHTML = '';
      const rows = state.scaleTickets.filter((t) => t.date === state.deskDate);
      if (!rows.length) {
        body.innerHTML = '<div class="empty-state" style="border:none;margin:0;border-radius:0;">No scale tickets for this date.</div>';
        return;
      }
      rows.forEach((t) => {
        const row = document.createElement('div');
        row.className = 'scale-table-row';
        const cust = escapeHtml(t.customer || '—');
        const job = escapeHtml(t.job || '—');
        const st = escapeHtml(t.status || '—');
        row.innerHTML = `
          <div>${escapeHtml(t.truck)}</div>
          <div>${escapeHtml(String(t.ticket || '—'))}</div>
          <div>${Number(t.netTons).toFixed(2)}</div>
          <div>${escapeHtml(t.material || '—')}</div>
          <div title="${cust}">${cust}</div>
          <div title="${job}">${job}</div>
          <div>${t.tonsOrdered != null && !Number.isNaN(Number(t.tonsOrdered)) ? Number(t.tonsOrdered).toFixed(1) : '—'}</div>
          <div>${Number(t.loads) || 0}</div>
          <div>${st}</div>
          <div>${escapeHtml(String(t.time))}</div>
          <button type="button" class="ghost-btn" style="padding:8px 10px;font-size:11px;">Remove</button>
        `;
        row.querySelector('button').onclick = () => removeScaleTicket(t.id);
        body.appendChild(row);
      });
    }

    function renderOrderTable() {
      const body = el('orderTableBody');
      if (!body) return;
      body.innerHTML = '';
      const rows = state.dailyOrders.filter((o) => o.date === state.deskDate);
      if (!rows.length) {
        body.innerHTML = '<div class="empty-state" style="border:none;margin:0;border-radius:0;">No orders scheduled for this date.</div>';
        return;
      }
      rows.forEach((o) => {
        const row = document.createElement('div');
        row.className = 'order-row-grid';
        const noteHtml = o.notes
          ? `<div style="color:var(--muted-2);font-size:11px;margin-top:4px;">${escapeHtml(o.notes)}</div>`
          : '';
        const loads = o.loads ? `<span style="color:var(--muted-2);"> · ${o.loads} loads</span>` : '';
        row.innerHTML = `
          <div>${escapeHtml(o.customer)}${noteHtml}</div>
          <div>${escapeHtml(o.job)}</div>
          <div>${escapeHtml(o.material)}${loads}</div>
          <div>${Number(o.tons).toFixed(1)}</div>
          <div><span class="tag">${escapeHtml(o.status)}</span></div>
          <button type="button" class="ghost-btn" style="padding:8px 12px;font-size:12px;">Remove</button>
        `;
        row.querySelector('button').onclick = () => removeDailyOrder(o.id);
        body.appendChild(row);
      });
    }

    function renderMiniCalendar() {
      const host = el('miniCalendarHost');
      if (!host) return;

      const { y, m } = state.calendarView;
      const first = new Date(y, m, 1);
      const startPad = first.getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const todayIso = isoFromDate(new Date());

      const cells = [];
      for (let i = 0; i < startPad; i++) {
        cells.push('<button type="button" class="cal-day" disabled aria-hidden="true">&nbsp;</button>');
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isSel = iso === state.deskDate;
        const isToday = iso === todayIso;
        const has = dayHasData(iso);
        const cls = ['cal-day'];
        if (isSel) cls.push('selected');
        if (isToday) cls.push('today');
        cells.push(
          `<button type="button" class="${cls.join(' ')}" onclick="setDeskDate('${iso}')">${d}${has ? '<span class="cal-dot"></span>' : '<span class="cal-dot" style="opacity:0;"></span>'}</button>`
        );
      }

      host.innerHTML = `
        <div class="mini-cal-head">
          <button type="button" class="cal-nav" onclick="deskMonthNav(-1)" aria-label="Previous month">‹</button>
          <strong>${monthNames[m]} ${y}</strong>
          <button type="button" class="cal-nav" onclick="deskMonthNav(1)" aria-label="Next month">›</button>
        </div>
        <div class="cal-weekdays"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
        <div class="cal-days">${cells.join('')}</div>
      `;
    }

    function renderDesk() {
      const picker = el('deskDatePicker');
      if (picker && state.deskDate) picker.value = state.deskDate;

      const pretty = parseISODateLocal(state.deskDate).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      const ls = el('deskDateLabelScale');
      if (ls) ls.textContent = pretty;
      const lo = el('deskDateLabelOrders');
      if (lo) lo.textContent = pretty;

      renderScaleTable();
      renderOrderTable();
      renderMiniCalendar();
      syncScaleTimeLiveToCentral();
      autofillScaleTicketNumber();
      syncScaleMaterialWeight();
      const scaleHint = el('scaleAccountHint');
      if (scaleHint && !state.selectedScaleCustomerAccountId) scaleHint.textContent = accountHintText();
      renderScaleAccountDropdown();
      const truckHint = el('scaleTruckHint');
      if (truckHint && !state.selectedScaleTruckTareId) {
        truckHint.textContent = state.truckTares.length
          ? 'Search and select a stored truck tare, or type a truck number.'
          : 'No stored truck tares yet — add one on Stored Truck Tares page.';
      }
      renderScaleTruckDropdown();
    }

    function syncScaleMaterialWeight() {
      const tareEl = el('scaleTareWeight');
      const grossEl = el('scaleGrossWeight');
      const totalEl = el('scaleTotalMaterialWeight');
      if (!tareEl || !grossEl || !totalEl) return;
      const tare = parseFloat(tareEl.value);
      const gross = parseFloat(grossEl.value);
      if (Number.isNaN(tare) || Number.isNaN(gross)) {
        totalEl.value = '';
        return;
      }
      const total = gross - tare;
      totalEl.value = Number.isFinite(total) ? total.toFixed(2) : '';
    }

    function formatMoney(v) { return `$${Number(v || 0).toFixed(2)}`; }
    function daysUntil(dateString) {
      const diff = new Date(dateString).getTime() - Date.now();
      if (diff <= 0) return 'Window closed';
      const days = Math.ceil(diff / 86400000);
      return `${days} day${days === 1 ? '' : 's'} left in window`;
    }

    function switchView(viewId) {
      document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
      const node = el(viewId);
      if (node) node.classList.add('active');
      state.currentView = viewId;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (viewId === 'homeView') updateDashboardGreeting();
    }

    function parsePath(pathname) {
      const raw = pathname.replace(/\/$/, '') || '/';
      if (raw === '/') return { page: 'home' };
      if (raw === '/loads' || raw === '/orders') return { page: 'orders' };
      if (raw === '/desk') return { page: 'desk' };
      if (raw === '/customer-accounts') return { page: 'customer-accounts' };
      if (raw === '/stored-truck-tares') return { page: 'stored-truck-tares' };
      if (raw === '/settings') return { page: 'settings' };
      if (raw === '/admin') return { page: 'admin' };
      if (raw.startsWith('/load/')) {
        let tid = raw.slice('/load/'.length);
        try {
          tid = decodeURIComponent(tid);
        } catch {
          return { page: 'orders' };
        }
        return { page: 'detail', tid };
      }
      return { page: 'home' };
    }

    function updateNavActive(pathname) {
      const p = pathname.replace(/\/$/, '') || '/';
      document.querySelectorAll('a[data-route]').forEach((a) => {
        const href = (a.getAttribute('href') || '').replace(/\/$/, '') || '/';
        let active = false;
        if (href === '/') {
          active = p === '/' || p === '';
        } else if (href === '/orders') {
          active = p === '/orders' || p === '/loads';
        } else {
          active = p === href;
        }
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    }

    function applyRouteFromLocation() {
      const pathname = window.location.pathname;
      const normalized = pathname.replace(/\/$/, '') || '/';
      const known =
        normalized === '/' ||
        ['/desk', '/loads', '/orders', '/customer-accounts', '/stored-truck-tares', '/settings', '/admin'].includes(normalized) ||
        normalized.startsWith('/load/');
      if (!known) {
        history.replaceState(null, '', '/');
        applyRouteFromLocation();
        return;
      }

      const route = parsePath(pathname);

      if (route.page === 'detail' && route.tid) {
        state.currentDetailId = route.tid;
        renderAll();
        const template = getTemplateById(route.tid);
        if (!template) {
          showToast('Load plan not found.');
          navigate('/', { replace: true });
          return;
        }
        renderDetail();
        switchView('detailView');
        updateNavActive(window.location.pathname);
        return;
      }

      renderAll();

      switch (route.page) {
        case 'home':
          switchView('homeView');
          updateNavActive('/');
          break;
        case 'desk':
          switchView('deskView');
          updateNavActive('/desk');
          break;
        case 'orders':
          switchView('ordersView');
          updateNavActive(window.location.pathname);
          break;
        case 'customer-accounts':
          renderCustomerAccountsPage();
          switchView('customerAccountsView');
          updateNavActive('/customer-accounts');
          break;
        case 'stored-truck-tares':
          renderStoredTruckTaresPage();
          switchView('storedTruckTaresView');
          updateNavActive('/stored-truck-tares');
          break;
        case 'admin':
          renderAdmin();
          switchView('adminView');
          updateNavActive('/admin');
          break;
        case 'settings':
          renderSettingsPage();
          initSettingsNav();
          switchView('settingsView');
          updateNavActive('/settings');
          break;
        default:
          switchView('homeView');
          updateNavActive('/');
      }
    }

    let routerBound = false;
    function initRouter() {
      if (!routerBound) {
        routerBound = true;
        window.addEventListener('popstate', () => applyRouteFromLocation());
        document.addEventListener('click', (e) => {
          const a = e.target.closest('a[data-route]');
          if (!a) return;
          const href = a.getAttribute('href');
          if (!href || !href.startsWith('/') || href.startsWith('//')) return;
          e.preventDefault();
          closeHeaderMenu();
          navigate(href);
        });
      }
      applyRouteFromLocation();
    }

    function navigate(path, { replace = false } = {}) {
      try {
        const next = new URL(path, window.location.origin);
        const nextPath = next.pathname + next.search;
        const cur = window.location.pathname + window.location.search;
        if (replace) history.replaceState(null, '', nextPath);
        else if (cur !== nextPath) history.pushState(null, '', nextPath);
      } catch {
        history.pushState(null, '', path);
      }
      applyRouteFromLocation();
    }

    function goHome() {
      navigate('/');
    }

    function openDetail(id) {
      navigate(`/load/${encodeURIComponent(id)}`);
    }

    function openAdmin() {
      navigate('/admin');
    }

    function showToast(message, durationMs = 2200) {
      const toast = el('toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(window.toastTimer);
      window.toastTimer = setTimeout(() => toast.classList.remove('show'), durationMs);
    }

    function getTemplateTotal(template) {
      return template.lineItems.reduce((sum, item) => sum + Number(item.qty) * Number(item.rate), 0);
    }

    function renderFeedTabs() {
      const container = el('feedTabs');
      if (!container) return;
      container.innerHTML = '';
      state.feedTabs.forEach((tab) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tab-btn ${state.feedTab === tab ? 'active' : ''}`;
        btn.textContent = tab;
        btn.onclick = () => {
          state.feedTab = tab;
          renderFeedTabs();
          renderTemplates();
        };
        container.appendChild(btn);
      });
    }

    function renderFilters() {
      const filtersEl = el('filters');
      if (!filtersEl) return;
      filtersEl.innerHTML = '';
      state.filters.forEach((filter) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pill ${state.activeFilter === filter ? 'active' : ''}`;
        btn.textContent = filter;
        btn.onclick = () => {
          state.activeFilter = filter;
          renderFilters();
          renderTemplates();
        };
        filtersEl.appendChild(btn);
      });
    }

    function getFilteredTemplates() {
      return state.templates.filter((template) => {
        const q = state.searchQuery.trim().toLowerCase();
        const blob = [template.name, template.category, template.status, template.customer, template.project, template.description].join(' ').toLowerCase();
        const matchesQuery = !q || blob.includes(q);
        const matchesFilter = state.activeFilter === 'All' || template.category.toLowerCase() === state.activeFilter.toLowerCase();
        const matchesTab =
          state.feedTab === 'All loads' ? true :
          state.feedTab === 'Drafts' ? template.status === 'Draft' :
          (() => {
            const pk = pinKeyForTemplate(template);
            return pk ? state.saved.has(pk) : false;
          })();
        return matchesQuery && matchesFilter && matchesTab;
      });
    }

    function renderTemplates() {
      const gridEl = el('templateGrid');
      if (!gridEl) return;
      gridEl.innerHTML = '';
      const items = getFilteredTemplates();

      if (!items.length) {
        gridEl.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">No load plans matched your filters.</div>`;
        return;
      }

      items.forEach((template) => {
        const total = getTemplateTotal(template);
        const card = document.createElement('article');
        card.className = 'card';
        card.innerHTML = `
          <div class="quote-card-top">
            <div>
              <span class="tag">${template.status}</span>
              <h3>${template.name}</h3>
              <p>${template.description}</p>
            </div>
          </div>
          <div class="quote-meta">
            <div>${template.category} · ${template.customer}</div>
            <div>${template.project}</div>
          </div>
          <div class="quote-price">${formatMoney(total)}</div>
          <div class="action-row" style="margin-top: 18px;">
            <button type="button" class="mini-btn" onclick="openDetail(${JSON.stringify(template.tid)})">Open</button>
            <button type="button" class="ghost-btn" onclick="navigate('/desk')">Scale Tickets</button>
          </div>
        `;
        gridEl.appendChild(card);
      });
    }

    function getTemplateById(tid) {
      return state.templates.find((t) => t.tid === tid);
    }

    function renderDetail() {
      const template = getTemplateById(state.currentDetailId);
      if (!template) {
        showToast('Load plan not found.');
        navigate('/', { replace: true });
        return;
      }

      el('detailHeader').textContent = template.name;
      el('sheetTitle').textContent = template.name;
      el('detailBadge').textContent = template.status;
      el('detailIssueDate').textContent = `Opened ${template.issueDate}`;
      el('sheetCustomer').textContent = template.customer;
      el('sheetProject').textContent = template.project;
      el('sheetExpiry').textContent = `${template.validThrough} (${daysUntil(template.validThrough)})`;
      el('sheetTerms').textContent = template.terms;

      const rows = el('detailLineRows');
      rows.innerHTML = '';
      template.lineItems.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'line-row';
        const lineTotal = Number(item.qty) * Number(item.rate);
        row.innerHTML = `
          <div>${item.description}</div>
          <div>${item.qty}</div>
          <div>${item.unit}</div>
          <div>${formatMoney(item.rate)}</div>
          <div>${formatMoney(lineTotal)}</div>
        `;
        rows.appendChild(row);
      });

      el('detailStatus').textContent = template.status;
      el('detailName').textContent = template.name;
      el('detailPrice').textContent = formatMoney(getTemplateTotal(template));
      el('detailCountdown').innerHTML = `<span class="countdown-chip">${daysUntil(template.validThrough)}</span>`;
      el('detailDescription').textContent = template.description;

      const specs = el('detailSpecs');
      specs.innerHTML = '';
      template.specs.forEach((line) => {
        const div = document.createElement('div');
        div.textContent = `• ${line}`;
        specs.appendChild(div);
      });

      const saveBtn = el('detailSaveBtn');
      const pk = pinKeyForTemplate(template);
      saveBtn.textContent = pk && state.saved.has(pk) ? 'Unpin' : 'Pin';
    }

    function toggleSaveCurrentTemplate() {
      const template = getTemplateById(state.currentDetailId);
      if (!template) return;
      const pk = pinKeyForTemplate(template);
      if (!pk) {
        showToast('Sign in to pin templates.');
        return;
      }
      if (state.saved.has(pk)) state.saved.delete(pk);
      else state.saved.add(pk);
      const pinned = state.saved.has(pk);
      const owner = templateOwnerId(template);
      void sbSyncPinnedTemplate(template.id, owner, pinned);
      showToast(pinned ? 'Pinned to your board.' : 'Unpinned.');
      renderDetail();
      renderTemplates();
      updateBuilderBadge();
    }

    function useCurrentTemplate() {
      const template = getTemplateById(state.currentDetailId);
      if (!template) return;
      el('quoteCustomer').value = template.customer;
      el('quoteCompany').value = '';
      el('quoteProject').value = template.project;
      el('quoteLocation').value = '';
      el('quoteNumber').value = `RD-${String(template.id).padStart(4, '0')}`;
      el('quoteDate').value = template.issueDate;
      el('quoteExpiry').value = template.validThrough;
      el('quoteTerms').value = template.terms;
      el('quoteNotes').value = '';
      el('quoteScope').value = template.description;
      state.builderLines = template.lineItems.map((item) => ({
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        rate: item.rate
      }));
      if (!state.builderLines.length) addLineItem();
      navigate('/desk');
      showToast('Template copied. Review it on Scale Tickets.');
    }

    function computeBuilderTotals() {
      let subtotal = 0;
      state.builderLines.forEach((line) => {
        subtotal += Number(line.qty || 0) * Number(line.rate || 0);
      });
      const tax = subtotal * 0.065;
      const fees = subtotal * 0.0125;
      const total = subtotal + tax + fees;
      el('summarySubtotal').textContent = formatMoney(subtotal);
      el('summaryTax').textContent = formatMoney(tax);
      el('summaryFees').textContent = formatMoney(fees);
      el('summaryTotal').textContent = formatMoney(total);
    }

    function renderBuilderLines() {
      const wrap = el('quoteLines');
      wrap.innerHTML = '';
      state.builderLines.forEach((line, index) => {
        const card = document.createElement('div');
        card.className = 'line-item-card';
        card.innerHTML = `
          <input data-k="description" data-i="${index}" value="${line.description}" placeholder="Description" />
          <input data-k="qty" data-i="${index}" type="number" step="any" value="${line.qty}" placeholder="Qty" />
          <input data-k="unit" data-i="${index}" value="${line.unit}" placeholder="Unit" />
          <input data-k="rate" data-i="${index}" type="number" step="any" value="${line.rate}" placeholder="Rate" />
          <button type="button" class="remove-btn" data-remove="${index}" aria-label="Remove line">✕</button>
        `;
        wrap.appendChild(card);
      });

      wrap.querySelectorAll('input').forEach((input) => {
        input.addEventListener('input', (e) => {
          const idx = Number(e.target.dataset.i);
          const key = e.target.dataset.k;
          state.builderLines[idx][key] = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
          computeBuilderTotals();
        });
      });
      wrap.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.remove);
          state.builderLines.splice(idx, 1);
          renderBuilderLines();
          computeBuilderTotals();
        });
      });
      computeBuilderTotals();
    }

    function addLineItem() {
      state.builderLines.push({ description: '', qty: 1, unit: 'ton', rate: 0 });
      renderBuilderLines();
    }

    function renderBuilder() {
      if (!state.builderLines.length) {
        state.builderLines.push({ description: 'Delivered stone', qty: 100, unit: 'ton', rate: 24 });
      }
      renderBuilderLines();
      updateBuilderBadge();
    }

    function saveQuoteDraft() {
      showToast('Draft saved locally in this session.');
    }

    function seedQuoteDemo() {
      el('quoteCustomer').value = 'Summit Civil';
      el('quoteCompany').value = 'Summit Civil LLC';
      el('quoteProject').value = 'County road shoulder';
      el('quoteLocation').value = 'MM 142 — eastbound';
      el('quoteNumber').value = 'RD-DEMO-01';
      el('quoteDate').value = '2026-04-23';
      el('quoteExpiry').value = '2026-05-05';
      el('quoteTerms').value = 'Net 15';
      el('quoteNotes').value = 'Flaggers on site after 3pm. Alternate pit if queue exceeds 45 minutes.';
      el('quoteScope').value = '3/4″ clean per county spec; moisture within ±2% at scale.';
      state.builderLines = [
        { description: '3/4″ clean — delivered', qty: 260, unit: 'ton', rate: 26.5 },
        { description: 'Tandem haul', qty: 18, unit: 'load', rate: 165 },
        { description: 'Fuel surcharge pool', qty: 1, unit: 'lot', rate: 480 }
      ];
      renderBuilderLines();
      showToast('Demo haul sheet filled.');
    }

    function issueQuote() {
      const customer = el('quoteCustomer').value.trim() || 'Walk-in customer';
      const totalText = el('summaryTotal').textContent;
      const issued = {
        id: `ISS-${Date.now()}`,
        customer,
        total: totalText,
        when: new Date().toISOString().slice(0, 10)
      };
      state.issuedQuotes.unshift(issued);
      void sbInsertIssuedQuote(issued);
      showToast('Dispatch issued — added to admin list.');
      renderAdminList();
      updateBuilderBadge();
    }

    function printQuote() {
      window.print();
    }

    function updateBuilderBadge() {
      const n = state.builderLines.length;
      el('builderCount').textContent = String(n);
    }

    function createTemplate() {
      if (!state.session?.user) {
        showToast('Sign in to publish templates.');
        return;
      }
      const name = el('adminName').value.trim();
      if (!name) {
        showToast('Add a template name first.');
        return;
      }
      const nextId = Math.max(0, ...state.templates.map((t) => t.id)) + 1;
      const amount = parseFloat(el('adminAmount').value) || 0;
      const uid = state.session.user.id;
      const template = {
        id: nextId,
        userId: uid,
        tid: `${uid}:${nextId}`,
        name,
        category: el('adminCategory').value.trim() || 'Custom',
        amount,
        status: el('adminStatus').value.trim() || 'Draft',
        customer: el('adminCustomer').value.trim() || 'Sample customer',
        project: el('adminProject').value.trim() || 'Sample job site',
        issueDate: new Date().toISOString().slice(0, 10),
        validThrough: el('adminValid').value.trim() || '2026-12-31',
        terms: el('adminTerms').value.trim() || 'Net 30',
        description: el('adminDescription').value.trim() || 'New reusable load template.',
        specs: ['Published from admin', 'Edit line items in the builder after pinning'],
        lineItems: [
          { description: 'Delivered material', qty: 200, unit: 'ton', rate: 24 },
          { description: 'Haul', qty: 14, unit: 'load', rate: 175 }
        ]
      };
      state.templates.unshift(template);
      void sbUpsertTemplate(template);
      showToast('Template published.');
      renderAll();
      renderAdmin();
    }

    function fillAdminDemo() {
      el('adminName').value = 'Midwest Pit — surge loads';
      el('adminCategory').value = 'Sand';
      el('adminAmount').value = '5420';
      el('adminStatus').value = 'Scheduled';
      el('adminCustomer').value = 'Riverstone Paving';
      el('adminProject').value = 'Trail connector';
      el('adminValid').value = '2026-05-12';
      el('adminTerms').value = 'Due on receipt';
      el('adminDescription').value = 'Quick-turn sand with truck minimums and optional night pour.';
    }

    function renderAdminList() {
      const list = el('adminQuoteList');
      list.innerHTML = '';
      if (!state.issuedQuotes.length) {
        list.innerHTML = `<div class="empty-state">No issued haul sheets yet.</div>`;
        return;
      }
      state.issuedQuotes.forEach((q) => {
        const row = document.createElement('div');
        row.className = 'quote-row';
        row.innerHTML = `
          <div>
            <div style="font-weight: 700;">${q.customer}</div>
            <div style="color: var(--muted-2); font-size: 12px; margin-top: 4px;">${q.when}</div>
          </div>
          <span class="tag">${q.total}</span>
          <span class="status-pill">Issued</span>
        `;
        list.appendChild(row);
      });
    }

    function renderAdmin() {
      el('metricTemplates').textContent = String(state.templates.length);
      el('metricSaved').textContent = String(state.saved.size);
      el('metricIssued').textContent = String(state.issuedQuotes.length);
      renderAdminList();
    }

    function renderAuthTabs() {
      const tabs = el('authTabs');
      if (!tabs) return;
      const signup = allowPublicSignup();
      if (!signup) {
        state.authMode = 'login';
        tabs.style.display = 'none';
        tabs.innerHTML = '';
        return;
      }
      tabs.style.display = '';
      tabs.innerHTML = '';
      ;['login', 'register'].forEach((mode) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tab-btn ${state.authMode === mode ? 'active' : ''}`;
        btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
        btn.onclick = () => {
          state.authMode = mode;
          renderAuthTabs();
          syncAuthCopy();
        };
        tabs.appendChild(btn);
      });
    }

    function syncAuthCopy() {
      const login = state.authMode === 'login';
      const inviteOnly = !allowPublicSignup();
      el('authTitle').textContent = login ? 'Welcome back' : 'Create dispatcher access';
      el('authText').textContent = login
        ? inviteOnly
          ? 'Sign in with your username and password issued to you. Access is by invitation only.'
          : 'Sign in to pin load plans and track issued haul sheets.'
        : 'Register to save preferences across sessions when you connect a backend.';
      el('authSubmitBtn').textContent = login ? 'Sign in' : 'Create account';
      el('authName').style.display = login ? 'none' : 'block';
    }

    function toggleAuth(force) {
      const modal = el('authModal');
      if (!modal) return;
      const offline = !supabaseClient;
      const mustAuth = supabaseClient && !state.session;

      if (force === false && mustAuth) {
        showToast('Sign in to continue.');
        return;
      }

      if (typeof force === 'boolean') {
        modal.classList.toggle('open', force);
      } else {
        const willClose = modal.classList.contains('open');
        if (willClose && mustAuth) {
          showToast('Sign in to continue.');
          return;
        }
        modal.classList.toggle('open');
      }

      if (modal.classList.contains('open')) {
        modal.setAttribute('aria-hidden', 'false');
        renderAuthTabs();
        syncAuthCopy();
        const canDismiss = offline || !!state.session;
        setAuthModalDismissable(canDismiss);
      } else {
        modal.setAttribute('aria-hidden', 'true');
      }
    }

    async function submitAuth() {
      const rawLogin = el('authUsername').value.trim();
      const password = el('authPassword').value;
      if (!rawLogin || !password) {
        showToast('Enter username and password.');
        return;
      }
      if (!supabaseClient) {
        showToast('Cloud login needs Supabase env vars (use npm run dev with .env.local).');
        return;
      }

      try {
        if (state.authMode === 'register') {
          if (!allowPublicSignup()) {
            showToast('New accounts are created by your administrator in Supabase.');
            return;
          }
          const normalized = normalizeUsername(rawLogin);
          if (normalized.length < 3 || normalized.length > 32) {
            showToast('Username must be 3–32 characters (letters, numbers, periods, underscores, hyphens).');
            return;
          }
          const name = el('authName').value.trim();
          const email = `${normalized}@${authEmailDomain()}`;
          const meta = {
            username: normalized,
            ...(name ? { full_name: name } : {})
          };
          const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: meta }
          });
          if (error) throw error;
          const session = data?.session ?? null;
          const user = data?.user ?? session?.user ?? null;
          if (session && user) {
            state.session = session;
            state.user = user;
            closeAuthModal();
            showToast("You're signed in — account created.", 4500);
            try {
              await fetchUserProfile();
            } catch (e) {
              console.error(e);
            }
            updateAuthNav();
            applyRouteFromLocation();
            const pwReg = el('authPassword');
            if (pwReg) pwReg.value = '';
          } else {
            showToast('Check your email to confirm, then sign in.');
          }
        } else {
          const email = loginIdentifierToEmail(rawLogin);
          if (!email) {
            showToast('Enter a valid username or email.');
            return;
          }
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;

          let session = data?.session ?? null;
          let user = data?.user ?? session?.user ?? null;
          if (!session || !user) {
            const { data: gs } = await supabaseClient.auth.getSession();
            session = gs.session ?? null;
            user = gs.session?.user ?? null;
          }

          if (!session || !user) {
            showToast('Could not start a session. Confirm your email or try again.');
            return;
          }

          state.session = session;
          state.user = user;

          closeAuthModal();
          showToast('Signed in successfully.', 4500);

          try {
            await fetchUserProfile();
          } catch (e) {
            console.error(e);
          }
          updateAuthNav();
          applyRouteFromLocation();
          const pw = el('authPassword');
          if (pw) pw.value = '';
        }
      } catch (err) {
        const msg = err.message || String(err);
        const pathHint =
          /path|invalid|not recognized|requested path/i.test(msg)
            ? ' Fix: VITE_SUPABASE_URL must be https://YOUR-PROJECT.supabase.co (API settings) with no /rest or /auth path. Redeploy after changing env vars.'
            : '';
        showToast(msg + pathHint);
      }
    }

    function renderAll() {
      renderFeedTabs();
      renderFilters();
      renderTemplates();
      renderDesk();
      renderOrdersPage();
      renderSettingsPage();
      updateBuilderBadge();
    }

    const searchInputEl = el('searchInput');
    if (searchInputEl) {
      searchInputEl.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderTemplates();
      });
    }

    const deskPicker = el('deskDatePicker');
    if (deskPicker) {
      deskPicker.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v) setDeskDate(v);
      });
    }
    const scaleTareWeight = el('scaleTareWeight');
    if (scaleTareWeight) scaleTareWeight.addEventListener('input', () => syncScaleMaterialWeight());
    const scaleGrossWeight = el('scaleGrossWeight');
    if (scaleGrossWeight) scaleGrossWeight.addEventListener('input', () => syncScaleMaterialWeight());
    const scaleTruckSearch = el('scaleTruckSearch');
    if (scaleTruckSearch) {
      scaleTruckSearch.addEventListener('input', () => renderScaleTruckDropdown());
      scaleTruckSearch.addEventListener('focus', () => renderScaleTruckDropdown());
    }

    let scaleTimeLiveIntervalId = null;
    if (scaleTimeLiveIntervalId == null) {
      scaleTimeLiveIntervalId = setInterval(syncScaleTimeLiveToCentral, 1000);
    }

    const ordersPicker = el('ordersDatePicker');
    if (ordersPicker) {
      ordersPicker.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v) setOrdersBoardDate(v);
      });
    }

    const soAccountSearch = el('soAccountSearch');
    if (soAccountSearch) {
      soAccountSearch.addEventListener('input', () => renderAccountDropdown());
      soAccountSearch.addEventListener('focus', () => renderAccountDropdown());
    }

    const scaleAccountSearch = el('scaleAccountSearch');
    if (scaleAccountSearch) {
      scaleAccountSearch.addEventListener('input', () => renderScaleAccountDropdown());
      scaleAccountSearch.addEventListener('focus', () => renderScaleAccountDropdown());
    }
    const customerAccountsSearchInput = el('customerAccountsSearchInput');
    if (customerAccountsSearchInput) {
      customerAccountsSearchInput.addEventListener('input', (e) => {
        state.customerAccountsSearchQuery = e.target.value;
        renderCustomerAccountsList();
      });
    }
    const truckTaresSearchInput = el('truckTaresSearchInput');
    if (truckTaresSearchInput) {
      truckTaresSearchInput.addEventListener('input', (e) => {
        state.truckTaresSearchQuery = e.target.value;
        renderStoredTruckTaresList();
      });
    }
    document.addEventListener('click', (e) => {
      if (!e.target.closest?.('.account-combo')) {
        const dd = el('soAccountDropdown');
        if (dd) dd.hidden = true;
        const sdd = el('scaleAccountDropdown');
        if (sdd) sdd.hidden = true;
        const tdd = el('scaleTruckDropdown');
        if (tdd) tdd.hidden = true;
      }
      if (!e.target.closest?.('.header-menu')) closeHeaderMenu();
    });

    Object.assign(window, {
      state,
      navigate,
      goHome,
      openDetail,
      openAdmin,
      toggleAuth,
      toggleHeaderMenu,
      closeHeaderMenu,
      deskGoToToday,
      setOrdersBoardDate,
      ordersGoToToday,
      ordersMonthNav,
      toggleOrdersCalendarPanel,
      addSalesOrder,
      clearSalesOrderForm,
      addScaleTicket,
      clearScaleForm,
      addDailyOrder,
      setDeskDate,
      deskMonthNav,
      useCurrentTemplate,
      toggleSaveCurrentTemplate,
      addLineItem,
      saveQuoteDraft,
      seedQuoteDemo,
      issueQuote,
      printQuote,
      createTemplate,
      fillAdminDemo,
      submitAuth,
      signOutUser,
      setTheme,
      selectCustomerAccount,
      addCustomerAccount,
      addStoredTruckTare,
      saveGreetingName,
      changeProfilePassword
    });

    (async function bootstrapDesk() {
      initDeskDate();
      syncThemeRadios();
      if (!initSupabase()) {
        loadDeskStorage();
        loadSalesOrdersStorage();
        loadCustomerAccountsStorage();
        loadTruckTaresStorage();
        seedDeskIfEmpty();
        updateAuthNav();
        initRouter();
        syncAuthCopy();
        el('authName').style.display = 'none';
        return;
      }

      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_OUT') {
          resetStateAfterSignOut();
          loadDeskStorage();
          loadSalesOrdersStorage();
          loadCustomerAccountsStorage();
          loadTruckTaresStorage();
          seedDeskIfEmpty();
          updateAuthNav();
          toggleAuth(true);
          setAuthModalDismissable(false);
          applyRouteFromLocation();
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          state.session = session;
          state.user = session.user;
          closeAuthModal();
          await fetchUserProfile();
          updateAuthNav();
          try {
            await loadCloudData();
            loadCustomerAccountsStorage();
            loadTruckTaresStorage();
            persistDesk();
          } catch (err) {
            console.error(err);
            showToast('Could not sync after sign-in.');
          }
          applyRouteFromLocation();
        }
      });

      const {
        data: { session }
      } = await supabaseClient.auth.getSession();

      if (session?.user) {
        state.session = session;
        state.user = session.user;
        await fetchUserProfile();
        updateAuthNav();
        try {
          await loadCloudData();
          persistDesk();
          loadSalesOrdersStorage();
          loadCustomerAccountsStorage();
          loadTruckTaresStorage();
        } catch (err) {
          console.error(err);
          showToast('Could not load Supabase — using saved browser data.');
          loadDeskStorage();
          loadSalesOrdersStorage();
          loadCustomerAccountsStorage();
          loadTruckTaresStorage();
          seedDeskIfEmpty();
        }
      } else {
        resetStateAfterSignOut();
        loadDeskStorage();
        loadSalesOrdersStorage();
        loadCustomerAccountsStorage();
        loadTruckTaresStorage();
        seedDeskIfEmpty();
        toggleAuth(true);
        setAuthModalDismissable(false);
        updateAuthNav();
      }

      initRouter();
      syncAuthCopy();
      el('authName').style.display = 'none';
    })();