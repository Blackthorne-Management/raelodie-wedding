// RSVP page logic: name lookup -> per-event dynamic form -> Supabase submit.
// Guest list + RSVPs live in Supabase (Blackthorne-Management org). The public
// key below can only call the search_guests / get_guest_events / submit_rsvp
// functions; the tables themselves are not readable from the site.
// Event definitions live in data/events.json (per-event display + which fields to ask for).

const SUPABASE_URL = 'https://mawdkpwegsjmdqoagevi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VkEwuc8kY7nmpDaoZoWWkw_Fi0m3FqC';

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
    const q = searchInput.value.trim();
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
    const guest = matches[Number(btn.dataset.idx)];
    selectGuest(guest);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rsvp-search')) {
      suggestionsBox.hidden = true;
    }
  });

  function selectGuest(guest) {
    searchInput.value = guest.name;
    suggestionsBox.hidden = true;
    notFound.hidden = true;
    formArea.innerHTML = '<p class="lede center">Looking up your invitation…</p>';

    rpc('get_guest_events', { p_guest_id: guest.id })
      .then((guestEvents) => renderForm(guest, guestEvents || []))
      .catch(() => {
        formArea.innerHTML =
          '<p class="rsvp-status err">We could not load your invitation right now. Please refresh and try again.</p>';
      });
  }

  function renderForm(guest, guestEvents) {
    const invited = guestEvents.filter((key) => events[key]);

    if (!invited.length) {
      formArea.innerHTML =
        '<p class="rsvp-status err">We have you on the list, but no events are attached yet. Reach out to the couple and we\'ll sort it out.</p>';
      return;
    }

    formArea.innerHTML = `
      <form data-rsvp-form>
        <p class="lede center">Hi ${escapeHtml(guest.name)}! Here's what you're invited to. Let us know if you'll be there.</p>
        ${invited.map((key) => renderEventCard(key, events[key])).join('')}
        <div class="field">
          <label for="rsvp-email">Your email (so we can reach you with any updates)</label>
          <input type="text" id="rsvp-email" name="rsvp_email" required />
        </div>
        <div class="center">
          <button type="submit" class="btn btn-primary">Send RSVP</button>
        </div>
        <div data-rsvp-result></div>
      </form>
    `;

    const form = formArea.querySelector('[data-rsvp-form]');
    form.addEventListener('submit', (e) => handleSubmit(e, guest, invited));
    wireConditionalFields(form);
  }

  function renderEventCard(key, event) {
    return `
      <div class="event-card" data-event-key="${key}">
        <h3>${event.title}</h3>
        <p><strong>${event.dateLabel}</strong> &middot; ${event.timeLabel}<br>${event.location}</p>
        ${event.dressCode ? `<p><em>Dress code: ${event.dressCode}</em></p>` : ''}

        <div class="field">
          <label>Will you attend?</label>
          <div class="radio-row">
            <label><input type="radio" name="attending__${key}" value="yes" required> Joyfully yes</label>
            <label><input type="radio" name="attending__${key}" value="no" required> Sadly can't make it</label>
          </div>
        </div>

        ${renderExtraFields(key, event)}
      </div>
    `;
  }

  function renderExtraFields(key, event) {
    const fields = event.fields || [];
    let html = '';

    if (fields.includes('mealChoice')) {
      html += `
        <div class="field" data-attending-only>
          <label for="meal__${key}">Meal choice</label>
          <select id="meal__${key}" name="mealChoice__${key}">
            <option value="">Select one</option>
            <option value="chicken">Herb Chicken</option>
            <option value="fish">Citrus Fish</option>
            <option value="beef">Braised Beef</option>
            <option value="vegetarian">Garden Vegetarian</option>
            <option value="vegan">Vegan</option>
          </select>
        </div>`;
    }

    if (fields.includes('kosherMeal')) {
      html += `
        <div class="field" data-attending-only>
          <label>Need a kosher meal?</label>
          <div class="radio-row">
            <label><input type="radio" name="kosherMeal__${key}" value="yes"> Yes, please</label>
            <label><input type="radio" name="kosherMeal__${key}" value="no" checked> No thanks</label>
          </div>
        </div>`;
    }

    if (fields.includes('kidsMeal')) {
      html += `
        <div class="field" data-attending-only>
          <label>Bringing a child who needs a kids' meal?</label>
          <div class="radio-row">
            <label><input type="radio" name="kidsMeal__${key}" value="yes" data-kids-toggle="${key}"> Yes</label>
            <label><input type="radio" name="kidsMeal__${key}" value="no" data-kids-toggle="${key}" checked> No</label>
          </div>
        </div>
        <div class="field" data-kids-age="${key}" hidden>
          <label for="kidsAge__${key}">Child's age(s)</label>
          <input type="text" id="kidsAge__${key}" name="kidsAge__${key}" placeholder="e.g. 4 and 7">
        </div>`;
    }

    if (fields.includes('notes')) {
      html += `
        <div class="field">
          <label for="notes__${key}">Anything else we should know? (allergies, accessibility needs, etc.)</label>
          <textarea id="notes__${key}" name="notes__${key}" rows="2"></textarea>
        </div>`;
    }

    return html;
  }

  function wireConditionalFields(form) {
    form.querySelectorAll('[data-kids-toggle]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const key = radio.dataset.kidsToggle;
        const ageField = form.querySelector(`[data-kids-age="${key}"]`);
        if (ageField) ageField.hidden = radio.value !== 'yes';
      });
    });

    form.querySelectorAll('input[name^="attending__"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const card = radio.closest('.event-card');
        const attendingNo = card.querySelector('input[name^="attending__"][value="no"]').checked;
        card.querySelectorAll('[data-attending-only]').forEach((f) => {
          f.style.opacity = attendingNo ? 0.4 : 1;
        });
      });
    });
  }

  function handleSubmit(e, guest, invited) {
    e.preventDefault();
    const form = e.target;
    const resultBox = form.querySelector('[data-rsvp-result]');
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const yesNo = (v) => (v === 'yes' ? true : v === 'no' ? false : null);

    const responses = invited.map((key) => {
      const fields = events[key].fields || [];
      const attending = formData.get(`attending__${key}`) === 'yes';
      const kidsMeal = fields.includes('kidsMeal') ? yesNo(formData.get(`kidsMeal__${key}`)) : null;
      return {
        event_key: key,
        attending,
        meal_choice: attending ? formData.get(`mealChoice__${key}`) || null : null,
        kosher_meal: attending && fields.includes('kosherMeal') ? yesNo(formData.get(`kosherMeal__${key}`)) : null,
        kids_meal: attending ? kidsMeal : null,
        kids_ages: attending && kidsMeal ? formData.get(`kidsAge__${key}`) || null : null,
        notes: formData.get(`notes__${key}`) || null,
      };
    });

    submitBtn.disabled = true;
    rpc('submit_rsvp', {
      p_guest_id: guest.id,
      p_email: formData.get('rsvp_email') || '',
      p_responses: responses,
    })
      .then(() => {
        resultBox.innerHTML =
          '<p class="rsvp-status ok">You\'re all set, thank you for RSVPing! We can\'t wait to celebrate with you.</p>';
      })
      .catch(() => {
        submitBtn.disabled = false;
        resultBox.innerHTML =
          '<p class="rsvp-status err">Something went wrong sending that. Please try again, or email the couple directly.</p>';
      });
  }
});
