// RSVP page logic: name lookup -> whole household's per-person, per-event form -> Supabase submit.
// Guests belong to households (see js/supabase-config.js for the project). Finding any
// named member brings up everyone in the household, each with only the events they're
// invited to. The public key can only call search_guests / get_household / submit_rsvp;
// the tables themselves are not readable from the site.
// Event definitions live in data/events.json (display order, details, and which
// per-person fields to ask for: "mealChoice", "kosherMeal").

const MEAL_OPTIONS = [
  ['chicken', 'Herb Chicken'],
  ['fish', 'Citrus Fish'],
  ['beef', 'Braised Beef'],
  ['vegetarian', 'Garden Vegetarian'],
  ['vegan', 'Vegan'],
  ['kids', "Kids' meal"],
];

function rpc(fn, args) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }).then((r) => {
    if (!r.ok) throw new Error(`${fn} failed (${r.status})`);
    return r.status === 204 ? null : r.json();
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Match how names are stored for search: no accents, no quotes, lowercase.
function normalizeQuery(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/["'`]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.querySelector('[data-guest-search]');
  const suggestionsBox = document.querySelector('[data-guest-suggestions]');
  const formArea = document.querySelector('[data-rsvp-form-area]');
  const notFound = document.querySelector('[data-guest-not-found]');
  if (!searchInput || !formArea) return;

  let matches = [];
  let events = {};
  let searchTimer = null;
  let searchSeq = 0;

  fetch('data/events.json')
    .then((r) => r.json())
    .then((eventData) => {
      events = eventData;
    })
    .catch(() => {
      formArea.innerHTML =
        '<p class="rsvp-status err">We could not load the event details right now. Please refresh, or reach out to the couple directly.</p>';
    });

  searchInput.addEventListener('input', () => {
    const q = normalizeQuery(searchInput.value);
    formArea.innerHTML = '';
    notFound.hidden = true;
    clearTimeout(searchTimer);

    if (q.length < 3) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = '';
      return;
    }

    searchTimer = setTimeout(() => runSearch(q), 250);
  });

  function runSearch(q) {
    const seq = ++searchSeq;
    rpc('search_guests', { q })
      .then((results) => {
        if (seq !== searchSeq) return; // a newer keystroke already fired
        matches = results || [];
        if (!matches.length) {
          suggestionsBox.hidden = true;
          suggestionsBox.innerHTML = '';
          notFound.hidden = q.length < 5;
          return;
        }
        suggestionsBox.innerHTML = matches
          .map((g, i) => `<button type="button" data-idx="${i}">${escapeHtml(g.name)}</button>`)
          .join('');
        suggestionsBox.hidden = false;
      })
      .catch(() => {
        if (seq !== searchSeq) return;
        suggestionsBox.hidden = true;
        formArea.innerHTML =
          '<p class="rsvp-status err">We could not reach the guest list right now. Please try again in a moment.</p>';
      });
  }

  suggestionsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-idx]');
    if (!btn) return;
    selectGuest(matches[Number(btn.dataset.idx)]);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rsvp-search')) {
      suggestionsBox.hidden = true;
    }
  });

  function selectGuest(match) {
    searchInput.value = match.name;
    suggestionsBox.hidden = true;
    notFound.hidden = true;
    formArea.innerHTML = '<p class="lede center">Looking up your invitation…</p>';

    rpc('get_household', { p_household_id: match.household_id })
      .then((members) => renderForm(match, members || []))
      .catch(() => {
        formArea.innerHTML =
          '<p class="rsvp-status err">We could not load your invitation right now. Please refresh and try again.</p>';
      });
  }

  function renderForm(match, members) {
    // events.json order is the display order; only show events someone here is invited to.
    const eventKeys = Object.keys(events).filter((key) => members.some((m) => m.events.includes(key)));

    if (!eventKeys.length) {
      formArea.innerHTML =
        '<p class="rsvp-status err">We have you on the list, but no events are attached yet. Reach out to the couple and we\'ll sort it out.</p>';
      return;
    }

    const firstName = match.name.split(' ')[0];
    const hasPlusOnes = members.some((m) => m.is_plus_one);

    formArea.innerHTML = `
      <form data-rsvp-form novalidate>
        <p class="lede center">Hi ${escapeHtml(firstName)}! ${
          members.length > 1
            ? "Here's everyone in your party and what each of you is invited to. You can RSVP for the whole group."
            : "Here's what you're invited to. Let us know if you'll be there."
        }</p>

        <div class="event-card party-card">
          <h3>Your party</h3>
          <ul class="party-list">
            ${members.map((m) => `<li>${renderPartyMember(m)}</li>`).join('')}
          </ul>
          ${hasPlusOnes ? '<p class="party-hint">Bringing a guest? Add their name so we can make a place card.</p>' : ''}
        </div>

        ${eventKeys.map((key) => renderEventCard(key, events[key], members)).join('')}

        <div class="event-card">
          <div class="field">
            <label for="rsvp-email">Your email (so we can reach you with any updates)</label>
            <input type="email" id="rsvp-email" name="rsvp_email" required />
          </div>
          <div class="field">
            <label for="rsvp-notes">Anything else we should know? (allergies, accessibility needs, etc.)</label>
            <textarea id="rsvp-notes" name="rsvp_notes" rows="3"></textarea>
          </div>
        </div>

        <div class="center">
          <button type="submit" class="btn btn-primary">Send RSVP</button>
        </div>
        <div data-rsvp-result></div>
      </form>
    `;

    const form = formArea.querySelector('[data-rsvp-form]');
    form.addEventListener('submit', (e) => handleSubmit(e, match, members, eventKeys));
    wireForm(form);
  }

  function renderPartyMember(m) {
    if (!m.is_plus_one) return escapeHtml(m.name);
    return `
      <label class="plus-one">
        <span>Guest</span>
        <input type="text" name="plusName__${m.guest_id}" data-plus-name="${m.guest_id}" placeholder="Guest's name (optional)" maxlength="100">
      </label>`;
  }

  function renderEventCard(key, event, members) {
    const invited = members.filter((m) => m.events.includes(key));
    return `
      <div class="event-card" data-event-key="${key}">
        <h3>${escapeHtml(event.title)}</h3>
        <p><strong>${escapeHtml(event.dateLabel)}</strong> &middot; ${escapeHtml(event.timeLabel)}<br>${escapeHtml(event.location)}</p>
        ${event.dressCode ? `<p><em>Dress code: ${escapeHtml(event.dressCode)}</em></p>` : ''}
        ${invited.map((m) => renderPersonRow(key, event, m)).join('')}
      </div>
    `;
  }

  function renderPersonRow(key, event, m) {
    const fields = event.fields || [];
    const id = `${m.guest_id}__${key}`;
    let extras = '';

    if (fields.includes('mealChoice')) {
      extras += `
        <div class="field">
          <label for="meal__${id}">Meal choice</label>
          <select id="meal__${id}" name="meal__${id}" data-meal>
            <option value="">Select one</option>
            ${MEAL_OPTIONS.map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}
          </select>
        </div>`;
    }
    if (fields.includes('kosherMeal')) {
      extras += `
        <div class="field">
          <label class="check"><input type="checkbox" name="kosher__${id}" value="yes"> Needs a kosher meal</label>
        </div>`;
    }

    return `
      <div class="person-row" data-person-row>
        <div class="person-head">
          <span class="person-name" ${m.is_plus_one ? `data-plus-label="${m.guest_id}"` : ''}>${escapeHtml(m.is_plus_one ? 'Your guest' : m.name)}</span>
          <div class="radio-row">
            <label><input type="radio" name="att__${id}" value="yes"> Joyfully yes</label>
            <label><input type="radio" name="att__${id}" value="no"> Sadly can't make it</label>
          </div>
        </div>
        ${extras ? `<div class="person-extras" data-attending-only hidden>${extras}</div>` : ''}
      </div>
    `;
  }

  function wireForm(form) {
    // Per-person meal/kosher fields only appear once that person says yes.
    form.querySelectorAll('input[name^="att__"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const row = radio.closest('[data-person-row]');
        const extras = row.querySelector('[data-attending-only]');
        if (extras) extras.hidden = radio.value !== 'yes';
        row.classList.remove('missing');
      });
    });

    // Show the plus-one's name in each event once it's typed.
    form.querySelectorAll('[data-plus-name]').forEach((input) => {
      input.addEventListener('input', () => {
        const name = input.value.trim() || 'Your guest';
        form.querySelectorAll(`[data-plus-label="${input.dataset.plusName}"]`).forEach((el) => {
          el.textContent = name;
        });
      });
    });
  }

  function handleSubmit(e, match, members, eventKeys) {
    e.preventDefault();
    const form = e.target;
    const resultBox = form.querySelector('[data-rsvp-result]');
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const problems = [];

    form.querySelectorAll('.missing').forEach((el) => el.classList.remove('missing'));

    const responses = [];
    eventKeys.forEach((key) => {
      const fields = events[key].fields || [];
      members
        .filter((m) => m.events.includes(key))
        .forEach((m) => {
          const id = `${m.guest_id}__${key}`;
          const answer = formData.get(`att__${id}`);
          const row = form.querySelector(`[name="att__${id}"]`).closest('[data-person-row]');
          if (!answer) {
            row.classList.add('missing');
            problems.push('everyone');
            return;
          }
          const attending = answer === 'yes';
          const meal = attending && fields.includes('mealChoice') ? formData.get(`meal__${id}`) || '' : '';
          if (attending && fields.includes('mealChoice') && !meal) {
            row.classList.add('missing');
            problems.push('meal');
          }
          responses.push({
            guest_id: m.guest_id,
            event_key: key,
            attending,
            meal_choice: meal && meal !== 'kids' ? meal : null,
            kids_meal: attending && fields.includes('mealChoice') ? meal === 'kids' : null,
            kosher_meal: attending && fields.includes('kosherMeal') ? formData.get(`kosher__${id}`) === 'yes' : null,
            plus_one_name: m.is_plus_one ? (formData.get(`plusName__${m.guest_id}`) || '').trim() || null : null,
          });
        });
    });

    const email = (formData.get('rsvp_email') || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) problems.push('email');

    if (problems.length) {
      const msgs = [];
      if (problems.includes('everyone')) msgs.push('let us know yes or no for everyone at each event');
      if (problems.includes('meal')) msgs.push('pick a meal for everyone attending');
      if (problems.includes('email')) msgs.push('add a valid email');
      resultBox.innerHTML = `<p class="rsvp-status err">Almost there! Please ${msgs.join(', and ')}.</p>`;
      const first = form.querySelector('.missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submitBtn.disabled = true;
    rpc('submit_rsvp', {
      p_household_id: match.household_id,
      p_email: email,
      p_notes: formData.get('rsvp_notes') || '',
      p_responses: responses,
    })
      .then(() => {
        resultBox.innerHTML =
          '<p class="rsvp-status ok">You\'re all set, thank you for RSVPing! We can\'t wait to celebrate with you. (Need to change something? Just search your name again and resubmit.)</p>';
      })
      .catch(() => {
        submitBtn.disabled = false;
        resultBox.innerHTML =
          '<p class="rsvp-status err">Something went wrong sending that. Please try again, or email the couple directly.</p>';
      });
  }
});
