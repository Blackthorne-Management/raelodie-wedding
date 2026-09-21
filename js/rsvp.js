// RSVP page logic: name lookup -> per-event dynamic form -> Netlify Forms submit.
// Guest list lives in data/guests.json (name -> array of event keys).
// Event definitions live in data/events.json (per-event display + which fields to ask for).

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.querySelector('[data-guest-search]');
  const suggestionsBox = document.querySelector('[data-guest-suggestions]');
  const formArea = document.querySelector('[data-rsvp-form-area]');
  const notFound = document.querySelector('[data-guest-not-found]');
  if (!searchInput || !formArea) return;

  let guests = [];
  let events = {};
  let activeGuest = null;

  Promise.all([
    fetch('data/guests.json').then((r) => r.json()),
    fetch('data/events.json').then((r) => r.json()),
  ])
    .then(([guestData, eventData]) => {
      guests = guestData;
      events = eventData;
    })
    .catch(() => {
      formArea.innerHTML =
        '<p class="rsvp-status err">We could not load the guest list right now. Please refresh, or reach out to the couple directly.</p>';
    });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    formArea.innerHTML = '';
    notFound.hidden = true;
    activeGuest = null;

    if (q.length < 2) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = '';
      return;
    }

    const matches = guests.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 6);

    if (!matches.length) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = '';
      return;
    }

    suggestionsBox.innerHTML = matches
      .map((g, i) => `<button type="button" data-idx="${guests.indexOf(g)}">${g.name}</button>`)
      .join('');
    suggestionsBox.hidden = false;
  });

  suggestionsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-idx]');
    if (!btn) return;
    const guest = guests[Number(btn.dataset.idx)];
    selectGuest(guest);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rsvp-search')) {
      suggestionsBox.hidden = true;
    }
  });

  function selectGuest(guest) {
    activeGuest = guest;
    searchInput.value = guest.name;
    suggestionsBox.hidden = true;
    notFound.hidden = true;

    const invited = (guest.events || []).filter((key) => events[key]);

    if (!invited.length) {
      formArea.innerHTML =
        '<p class="rsvp-status err">We have you on the list, but no events are attached yet — reach out to the couple and we\'ll sort it out.</p>';
      return;
    }

    formArea.innerHTML = `
      <form data-rsvp-form>
        <p class="lede center">Hi ${guest.name}! Here's what you're invited to. Let us know if you'll be there.</p>
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

    const summaryLines = [`Guest: ${guest.name}`];
    invited.forEach((key) => {
      const title = events[key].title;
      const attending = formData.get(`attending__${key}`) || 'no response';
      summaryLines.push(`- ${title}: ${attending}`);
      (events[key].fields || []).forEach((f) => {
        const val = formData.get(`${f}__${key}`);
        if (val) summaryLines.push(`    ${f}: ${val}`);
      });
    });

    const payload = new URLSearchParams();
    payload.set('form-name', 'rsvp');
    payload.set('guest_name', guest.name);
    payload.set('rsvp_email', formData.get('rsvp_email') || '');
    payload.set('rsvp_details', summaryLines.join('\n'));
    payload.set('bot-field', '');

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    })
      .then(() => {
        resultBox.innerHTML =
          '<p class="rsvp-status ok">You\'re all set — thank you for RSVPing! We can\'t wait to celebrate with you.</p>';
        form.querySelector('button[type="submit"]').disabled = true;
      })
      .catch(() => {
        resultBox.innerHTML =
          '<p class="rsvp-status err">Something went wrong sending that. Please try again, or email the couple directly.</p>';
      });
  }
});
