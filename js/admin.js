// RSVP admin page: Supabase Auth sign-in -> admin_rsvp_overview() -> totals + table + CSV.
// One row per person per invited event; email and notes are per household.
// Supabase Auth signs in by email, so usernames map to an account email here.
// Access is enforced in the database: only users in public.admin_users can read RSVPs.

const ADMIN_ACCOUNTS = {
  raelodie: 'raelodiehome@gmail.com',
};

const MEAL_LABELS = {
  chicken: 'Herb Chicken',
  fish: 'Citrus Fish',
  beef: 'Braised Beef',
  vegetarian: 'Garden Vegetarian',
  vegan: 'Vegan',
};

document.addEventListener('DOMContentLoaded', () => {
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const loginForm = document.querySelector('[data-admin-login]');
  const loginResult = document.querySelector('[data-login-result]');
  const dashboard = document.querySelector('[data-admin-dashboard]');
  const statusBox = document.querySelector('[data-admin-status]');
  const eventFilter = document.querySelector('[data-event-filter]');
  const totalsBox = document.querySelector('[data-totals]');
  const rowsBody = document.querySelector('[data-rows]');

  let rows = [];
  let events = {};

  fetch('data/events.json')
    .then((r) => r.json())
    .then((data) => { events = data; })
    .catch(() => {})
    .finally(() => {
      db.auth.getSession().then(({ data }) => (data.session ? loadDashboard() : showLogin()));
    });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-user').value.trim().toLowerCase();
    const password = document.getElementById('admin-pass').value;
    const email = ADMIN_ACCOUNTS[username];
    const btn = loginForm.querySelector('button[type="submit"]');
    loginResult.innerHTML = '';

    if (!email) {
      loginResult.innerHTML = '<p class="rsvp-status err">Wrong username or password.</p>';
      return;
    }

    btn.disabled = true;
    db.auth.signInWithPassword({ email, password }).then(({ error }) => {
      btn.disabled = false;
      if (error) {
        loginResult.innerHTML = '<p class="rsvp-status err">Wrong username or password.</p>';
        return;
      }
      document.getElementById('admin-pass').value = '';
      loadDashboard();
    });
  });

  document.querySelector('[data-sign-out]').addEventListener('click', () => {
    db.auth.signOut().then(showLogin);
  });
  document.querySelector('[data-refresh]').addEventListener('click', loadDashboard);
  document.querySelector('[data-download-csv]').addEventListener('click', downloadCsv);
  eventFilter.addEventListener('change', render);

  function showLogin() {
    dashboard.hidden = true;
    statusBox.innerHTML = '';
    loginForm.hidden = false;
  }

  function loadDashboard() {
    loginForm.hidden = true;
    statusBox.innerHTML = '<p class="lede center">Loading RSVPs…</p>';

    db.rpc('admin_rsvp_overview').then(({ data, error }) => {
      if (error) {
        const denied = error.code === '42501';
        statusBox.innerHTML = `<p class="rsvp-status err">${
          denied ? 'This account is not set up as an admin.' : 'Could not load RSVPs. Try Refresh.'
        }</p>`;
        if (denied) db.auth.signOut().then(() => { loginForm.hidden = false; });
        return;
      }
      rows = data || [];
      statusBox.innerHTML = '';
      dashboard.hidden = false;
      populateFilter();
      render();
    });
  }

  function eventTitle(key) {
    return events[key] ? events[key].title : key;
  }

  function populateFilter() {
    const current = eventFilter.value;
    const keys = [...new Set(rows.map((r) => r.event_key))];
    eventFilter.innerHTML =
      '<option value="">All events</option>' +
      keys.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(eventTitle(k))}</option>`).join('');
    if (keys.includes(current)) eventFilter.value = current;
  }

  function visibleRows() {
    const key = eventFilter.value;
    return key ? rows.filter((r) => r.event_key === key) : rows;
  }

  function render() {
    const list = visibleRows();
    const keys = eventFilter.value ? [eventFilter.value] : [...new Set(rows.map((r) => r.event_key))];

    totalsBox.innerHTML = keys
      .map((k) => {
        const evRows = rows.filter((r) => r.event_key === k);
        const count = (resp) => evRows.filter((r) => r.response === resp).length;
        const yes = evRows.filter((r) => r.response === 'yes');
        const meals = {};
        yes.forEach((r) => { if (r.meal_choice) meals[r.meal_choice] = (meals[r.meal_choice] || 0) + 1; });
        const extras = [
          ...Object.entries(meals).map(([m, n]) => `${escapeHtml(MEAL_LABELS[m] || m)}: ${n}`),
          yes.some((r) => r.kosher_meal) ? `Kosher: ${yes.filter((r) => r.kosher_meal).length}` : '',
          yes.some((r) => r.kids_meal) ? `Kids' meals: ${yes.filter((r) => r.kids_meal).length}` : '',
        ].filter(Boolean);
        return `
          <div class="admin-total card">
            <h3>${escapeHtml(eventTitle(k))}</h3>
            <p><strong>${count('yes')}</strong> yes &middot; <strong>${count('no')}</strong> no &middot;
               <strong>${count('no response')}</strong> waiting</p>
            ${extras.length ? `<p class="admin-extras">${extras.join(' &middot; ')}</p>` : ''}
          </div>`;
      })
      .join('');

    rowsBody.innerHTML = list.length
      ? list
          .map((r) => `
            <tr class="resp-${r.response === 'no response' ? 'none' : r.response}">
              <td>${escapeHtml(r.household)}</td>
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(eventTitle(r.event_key))}</td>
              <td>${escapeHtml(r.response)}</td>
              <td>${r.kids_meal ? "Kids' meal" : escapeHtml(MEAL_LABELS[r.meal_choice] || r.meal_choice || '')}</td>
              <td>${r.kosher_meal ? 'Yes' : ''}</td>
              <td>${escapeHtml(r.email || '')}</td>
              <td>${escapeHtml(r.notes || '')}</td>
              <td>${r.updated_at ? new Date(r.updated_at).toLocaleDateString() : ''}</td>
            </tr>`)
          .join('')
      : '<tr><td colspan="9" class="center">No invitations yet.</td></tr>';
  }

  function downloadCsv() {
    const header = ['Household', 'Guest', 'Event', 'Response', 'Meal', 'Kosher', 'Email', 'Notes', 'Updated'];
    const lines = visibleRows().map((r) => [
      r.household,
      r.name,
      eventTitle(r.event_key),
      r.response,
      r.kids_meal ? "Kids' meal" : MEAL_LABELS[r.meal_choice] || r.meal_choice || '',
      r.kosher_meal ? 'Yes' : '',
      r.email || '',
      r.notes || '',
      r.updated_at || '',
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rsvps${eventFilter.value ? `-${eventFilter.value}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
});
