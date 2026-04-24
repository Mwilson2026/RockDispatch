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

    const stories = [
      {
        title: 'Keep the board honest',
        text: 'Match scale tons to slip counts early. When rip rap or export jobs drift, it is almost always tickets entered late—not trucks running light.'
      },
      {
        title: 'Window beats price on busy pits',
        text: 'Customers remember reliable dispatch windows more than a dollar off per ton. Publish the load window like you mean it.'
      }
    ];

    const STORAGE_SCALE = 'rockDispatch_scaleTickets_v1';
    const STORAGE_ORDERS = 'rockDispatch_dailyOrders_v1';
    const STORAGE_SALES_ORDERS = 'rockDispatch_salesOrders_v1';
    const STORAGE_CUSTOMER_ACCOUNTS = 'rockDispatch_customerAccounts_v1';

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
      selectedCustomerAccountId: null
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

    async function fetchUserProfile() {
      state.role = 'user';
      state.isAdmin = false;
      state.profileDisplayName = null;
      if (!supabaseClient || !state.session?.user?.id) return;
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('role, display_name')
        .eq('id', state.session.user.id)
        .maybeSingle();
      if (error) {
        console.error(error);
        return;
      }
      state.role = data?.role === 'admin' ? 'admin' : 'user';
      state.isAdmin = state.role === 'admin';
      const dn = data?.display_name;
      state.profileDisplayName = typeof dn === 'string' && dn.trim() ? dn.trim() : null;
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

/** Prefer profile-style name from auth metadata; never show full email in the nav. */
function humanizeEmailLocalPart(local) {
  const raw = String(local || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/[._]+/g, ' ').trim();
  if (!cleaned) return raw;
  return cleaned
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .filter(Boolean)
    .join(' ');
}

/** Fallback display string when profiles.display_name is empty (no "Hi" prefix). */
function fallbackPersonName(user) {
  if (!user) return '';
  const meta = user.user_metadata || {};
  const fromMeta = String(meta.full_name || meta.username || meta.name || meta.display_name || '').trim();
  if (fromMeta) return fromMeta;
  const email = String(user.email || '').trim();
  if (!email) return '';
  const local = email.includes('@') ? email.split('@')[0] : email;
  const humanized = humanizeEmailLocalPart(local);
  return humanized || '';
}

/** Nav label: Hi + name from profile row, then metadata/email local part. Admins get · Admin suffix. */
function navAccountGreeting(user) {
  if (!user) return 'Hi';
  const fromProfile = state.profileDisplayName?.trim();
  const fallback = fallbackPersonName(user);
  const name = fromProfile || fallback;
  const hi = name ? `Hi, ${name}` : 'Hi';
  return state.isAdmin ? `${hi} · Admin` : hi;
}

function closeNavUserDropdown() {
  const dd = el('navUserDropdown');
  const tr = el('navUserTrigger');
  const root = el('navUserMenuRoot');
  if (dd) dd.hidden = true;
  if (tr) tr.setAttribute('aria-expanded', 'false');
  root?.classList.remove('nav-user-menu--open');
}

function openNavUserDropdown() {
  const dd = el('navUserDropdown');
  const tr = el('navUserTrigger');
  const root = el('navUserMenuRoot');
  if (dd) dd.hidden = false;
  if (tr) tr.setAttribute('aria-expanded', 'true');
  root?.classList.add('nav-user-menu--open');
}

function initNavUserMenu() {
  if (initNavUserMenu.done) return;
  initNavUserMenu.done = true;
  const trig = el('navUserTrigger');
  if (trig) {
    trig.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = el('navUserDropdown');
      if (!dd) return;
      if (dd.hidden) openNavUserDropdown();
      else closeNavUserDropdown();
    });
  }
  document.addEventListener('click', (e) => {
    const root = el('navUserMenuRoot');
    if (!root || root.hidden) return;
    if (e.target.closest('#navUserMenuRoot')) return;
    closeNavUserDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNavUserDropdown();
  });
}

function updateAuthNav() {
  const loginBtn = el('authLoginBtn');
  const userRoot = el('navUserMenuRoot');
  const labelEl = el('navUserLabel');
  if (!supabaseClient) {
    if (loginBtn) {
      loginBtn.textContent = 'Offline';
      loginBtn.hidden = false;
    }
    if (userRoot) userRoot.hidden = true;
    closeNavUserDropdown();
    return;
  }
  if (state.session?.user) {
    if (loginBtn) loginBtn.hidden = true;
    if (userRoot) userRoot.hidden = false;
    const text = navAccountGreeting(state.session.user);
    if (labelEl) labelEl.textContent = text;
  } else {
    if (loginBtn) {
      loginBtn.hidden = false;
      loginBtn.textContent = 'Login';
    }
    if (userRoot) userRoot.hidden = true;
    closeNavUserDropdown();
  }
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
  closeNavUserDropdown();
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
        notes: row.notes || ''
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
        notes: t.notes || ''
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
        { id: 'S-seed-1', date: today, truck: 'T-104', ticket: 'SC-9081', netTons: 24.6, material: '3/4 clean', time: '06:42', notes: '' },
        { id: 'S-seed-2', date: today, truck: 'T-212', ticket: 'SC-9082', netTons: 25.1, material: '1-1/2 base', time: '07:05', notes: 'Moisture OK' }
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
    }

    function persistCustomerAccounts() {
      try {
        localStorage.setItem(STORAGE_CUSTOMER_ACCOUNTS, JSON.stringify(state.customerAccounts));
      } catch (e) {}
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

    function clearAccountSelection() {
      state.selectedCustomerAccountId = null;
      const hid = el('soAccountId');
      const search = el('soAccountSearch');
      const hint = el('soAccountHint');
      if (hid) hid.value = '';
      if (search) search.value = '';
      if (hint) {
        hint.textContent = state.customerAccounts.length
          ? 'Search and select a customer account.'
          : 'No accounts yet — an admin can add customer accounts in Settings.';
      }
      const dd = el('soAccountDropdown');
      if (dd) dd.hidden = true;
    }

    function getFilteredCustomerAccounts() {
      const q = (el('soAccountSearch')?.value || '').trim().toLowerCase();
      return state.customerAccounts.filter((a) => !q || a.name.toLowerCase().includes(q));
    }

    function renderAccountDropdown() {
      const dd = el('soAccountDropdown');
      if (!dd) return;
      const items = getFilteredCustomerAccounts();
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

    function renderSettingsPage() {
      if (!el('settingsPanelAppearance')) return;
      syncThemeRadios();
      const adminBlk = el('settingsAccountsAdminBlock');
      const locked = el('settingsAccountsLocked');
      const canManage = !!state.isAdmin;
      if (adminBlk) adminBlk.hidden = !canManage;
      if (locked) locked.hidden = canManage;
      if (canManage) renderCustomerAccountsList();
    }

    function renderCustomerAccountsList() {
      const wrap = el('customerAccountsList');
      if (!wrap) return;
      if (!state.customerAccounts.length) {
        wrap.innerHTML = '<div class="empty-state">No customer accounts yet. Add one above.</div>';
        return;
      }
      wrap.innerHTML = '';
      state.customerAccounts.forEach((a) => {
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

    function addCustomerAccountFromSettings() {
      if (!state.isAdmin) {
        showToast('Only administrators can manage customer accounts.');
        return;
      }
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
      persistCustomerAccounts();
      if (inp) inp.value = '';
      renderCustomerAccountsList();
      renderAccountDropdown();
      clearAccountSelection();
      showToast('Customer account added.');
    }

    function renameCustomerAccount(id) {
      if (!state.isAdmin) return;
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
      renderCustomerAccountsList();
      renderAccountDropdown();
      if (state.selectedCustomerAccountId === id) selectCustomerAccount(id);
      showToast('Account updated.');
    }

    function deleteCustomerAccount(id) {
      if (!state.isAdmin) return;
      if (!window.confirm('Delete this customer account? Existing orders keep the name they had when saved.')) return;
      state.customerAccounts = state.customerAccounts.filter((a) => a.id !== id);
      persistCustomerAccounts();
      renderCustomerAccountsList();
      renderAccountDropdown();
      if (state.selectedCustomerAccountId === id) clearAccountSelection();
      showToast('Account removed.');
    }

    function showSettingsSection(panel) {
      const app = el('settingsPanelAppearance');
      const acc = el('settingsPanelAccounts');
      const navBtns = document.querySelectorAll('.settings-nav-btn');
      navBtns.forEach((b) => {
        const active = b.dataset.settingsPanel === panel;
        b.classList.toggle('active', active);
      });
      if (app) {
        app.hidden = panel !== 'appearance';
      }
      if (acc) acc.hidden = panel !== 'accounts';
      if (panel === 'accounts') renderSettingsPage();
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
      if (hint && !state.selectedCustomerAccountId) {
        hint.textContent = state.customerAccounts.length
          ? 'Search and select a customer account.'
          : 'No accounts yet — an admin can add customer accounts in Settings.';
      }
      renderAccountDropdown();
    }

    function clearScaleForm() {
      el('scaleTruck').value = '';
      el('scaleTicket').value = '';
      el('scaleTime').value = '';
      el('scaleNet').value = '';
      el('scaleMaterial').value = '';
      el('scaleNotes').value = '';
    }

    function addScaleTicket() {
      const truck = el('scaleTruck').value.trim();
      const net = parseFloat(el('scaleNet').value);
      if (!truck || Number.isNaN(net)) {
        showToast('Enter truck # and net tons.');
        return;
      }
      const newTicket = {
        id: `S-${Date.now()}`,
        date: state.deskDate,
        truck,
        ticket: el('scaleTicket').value.trim(),
        netTons: net,
        material: el('scaleMaterial').value.trim() || '—',
        time: el('scaleTime').value || '—',
        notes: el('scaleNotes').value.trim()
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
        const note = t.notes ? ` <span style="color:var(--muted-2);">(${escapeHtml(t.notes)})</span>` : '';
        const ticket = t.ticket ? ` <span style="color:var(--muted-2);">#${escapeHtml(t.ticket)}</span>` : '';
        row.innerHTML = `
          <div>${escapeHtml(t.truck)}${ticket}${note}</div>
          <div>${Number(t.netTons).toFixed(2)}</div>
          <div>${escapeHtml(t.material)}</div>
          <div>${escapeHtml(String(t.time))}</div>
          <button type="button" class="ghost-btn" style="padding:8px 12px;font-size:12px;">Remove</button>
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
    }

    function parsePath(pathname) {
      const raw = pathname.replace(/\/$/, '') || '/';
      if (raw === '/') return { page: 'home' };
      if (raw === '/loads' || raw === '/orders') return { page: 'orders' };
      if (raw === '/desk') return { page: 'desk' };
      if (raw === '/settings') return { page: 'settings' };
      if (raw === '/ops') return { page: 'ops' };
      if (raw === '/builder') return { page: 'builder' };
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
        ['/desk', '/loads', '/orders', '/settings', '/ops', '/builder', '/admin'].includes(normalized) ||
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
        case 'ops':
          switchView('opsView');
          updateNavActive('/ops');
          break;
        case 'builder':
          renderBuilder();
          switchView('builderView');
          updateNavActive('/builder');
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

    function openBuilder() {
      navigate('/builder');
    }

    function openAdmin() {
      navigate('/admin');
    }

    function showToast(message) {
      const toast = el('toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(window.toastTimer);
      window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
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
            <button type="button" class="ghost-btn" onclick="openBuilder()">Dispatch sheet</button>
          </div>
        `;
        gridEl.appendChild(card);
      });
    }

    function renderStories() {
      const grid = el('storyGrid');
      grid.innerHTML = '';
      stories.forEach((story) => {
        const article = document.createElement('article');
        article.className = 'story-card';
        article.innerHTML = `
          <div class="overlay"></div>
          <div class="story-copy">
            <span class="eyebrow">Ops note</span>
            <h3>${story.title}</h3>
            <p>${story.text}</p>
          </div>
        `;
        grid.appendChild(article);
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
      openBuilder();
      showToast('Template copied into dispatch builder.');
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
        renderAuthTabs();
        syncAuthCopy();
        const canDismiss = offline || !!state.session;
        setAuthModalDismissable(canDismiss);
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
          if (data.session) {
            toggleAuth(false);
            showToast('Account created.');
          } else {
            showToast('Check your email to confirm, then sign in.');
          }
        } else {
          const email = loginIdentifierToEmail(rawLogin);
          if (!email) {
            showToast('Enter a valid username or email.');
            return;
          }
          const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;
          toggleAuth(false);
          showToast('Signed in.');
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
      renderStories();
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
    document.addEventListener('click', (e) => {
      if (!e.target.closest?.('.account-combo')) {
        const dd = el('soAccountDropdown');
        if (dd) dd.hidden = true;
      }
    });

    Object.assign(window, {
      state,
      navigate,
      goHome,
      openDetail,
      openBuilder,
      openAdmin,
      toggleAuth,
      closeNavUserDropdown,
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
      addCustomerAccountFromSettings
    });

    (async function bootstrapDesk() {
      initDeskDate();
      syncThemeRadios();
      initNavUserMenu();

      if (!initSupabase()) {
        loadDeskStorage();
        loadSalesOrdersStorage();
        loadCustomerAccountsStorage();
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
          await fetchUserProfile();
          updateAuthNav();
          try {
            await loadCloudData();
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
        } catch (err) {
          console.error(err);
          showToast('Could not load Supabase — using saved browser data.');
          loadDeskStorage();
          loadSalesOrdersStorage();
          loadCustomerAccountsStorage();
          seedDeskIfEmpty();
        }
      } else {
        resetStateAfterSignOut();
        loadDeskStorage();
        loadSalesOrdersStorage();
        loadCustomerAccountsStorage();
        seedDeskIfEmpty();
        toggleAuth(true);
        setAuthModalDismissable(false);
        updateAuthNav();
      }

      initRouter();
      syncAuthCopy();
      el('authName').style.display = 'none';
    })();