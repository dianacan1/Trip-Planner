(() => {
  "use strict";

  const STORAGE_KEY = "trip-planner-data-v1";

  const TYPE_LABELS = { flight: "Flight", car: "Car", stay: "Housing", activity: "Activity" };
  const TYPE_ICONS = { flight: "\u2708\uFE0F", car: "\uD83D\uDE97", stay: "\uD83C\uDFE8", activity: "\uD83D\uDCCD" };

  // ---------- State ----------
  let state = loadState();

  function defaultState() {
    return { trip: { name: "", start: "", end: "" }, items: [] };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        trip: Object.assign(defaultState().trip, parsed.trip || {}),
        items: Array.isArray(parsed.items) ? parsed.items : []
      };
    } catch (e) {
      console.error("Failed to load saved trip data", e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save trip data", e);
      showToast("Couldn't save — your device storage may be full.");
    }
  }

  // ---------- Utilities ----------
  function uid() {
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function parseDateOnly(str) {
    // "YYYY-MM-DD" -> local Date at midnight, avoiding UTC off-by-one
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDayLabel(dateStr) {
    const d = parseDateOnly(dateStr);
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  function formatShortDate(dateStr) {
    const d = parseDateOnly(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatTime(dtLocal) {
    if (!dtLocal) return "";
    const d = new Date(dtLocal);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function formatHHMM(hhmm) {
    if (!hhmm) return "";
    const d = new Date(`2000-01-01T${hhmm}`);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function formatDateTimeShort(dtLocal) {
    if (!dtLocal) return "";
    const d = new Date(dtLocal);
    if (isNaN(d)) return "";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function tripDays() {
    const { start, end } = state.trip;
    if (!start || !end) return [];
    const s = parseDateOnly(start);
    const e = parseDateOnly(end);
    if (e < s) return [];
    const days = [];
    let cur = new Date(s);
    while (cur <= e) {
      days.push(isoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  // ---------- Tab navigation ----------
  function switchView(viewName) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === viewName));
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewName));
    if (viewName === "plan") renderPlan();
    if (viewName === "add") renderAllItemsList();
    if (viewName === "map") renderMap();
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // ---------- Geocoding (Nominatim / OpenStreetMap, free, no key) ----------
  const GEO_FIELDS = ["f_from", "f_to", "c_pickupLoc", "c_dropoffLoc", "s_address", "a_location"];

  function geoData(id) {
    const input = document.getElementById(id);
    return { lat: (input && input.dataset.lat) || null, lon: (input && input.dataset.lon) || null };
  }

  function clearGeoField(id) {
    const input = document.getElementById(id);
    if (!input) return;
    delete input.dataset.lat;
    delete input.dataset.lon;
    delete input.dataset.resolved;
    const status = document.getElementById(id + "_status");
    if (status) { status.textContent = ""; status.className = "geo-status"; }
    const results = document.getElementById(id + "_results");
    if (results) { results.innerHTML = ""; results.hidden = true; }
  }

  function restoreGeoField(id, lat, lon) {
    const input = document.getElementById(id);
    if (!input) return;
    const status = document.getElementById(id + "_status");
    if (lat && lon) {
      input.dataset.lat = lat;
      input.dataset.lon = lon;
      if (status) { status.textContent = "\u2713 Located on map"; status.className = "geo-status found"; }
    } else {
      clearGeoField(id);
    }
  }

  async function geocodeQuery(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) throw new Error("Geocode request failed");
    return res.json();
  }

  function applyGeoMatch(id, match) {
    const input = document.getElementById(id);
    const status = document.getElementById(id + "_status");
    const results = document.getElementById(id + "_results");
    input.value = match.display_name;
    input.dataset.lat = match.lat;
    input.dataset.lon = match.lon;
    status.textContent = "\u2713 Located on map";
    status.className = "geo-status found";
    results.innerHTML = "";
    results.hidden = true;
  }

  function setupGeoField(id) {
    const input = document.getElementById(id);
    const btn = document.querySelector(`.geo-find-btn[data-geo="${id}"]`);
    const status = document.getElementById(id + "_status");
    const results = document.getElementById(id + "_results");
    if (!input || !btn) return;

    input.addEventListener("input", () => {
      if (input.dataset.lat) clearGeoField(id);
    });

    btn.addEventListener("click", async () => {
      const query = input.value.trim();
      if (!query) {
        status.textContent = "Type an address first";
        status.className = "geo-status error";
        return;
      }
      btn.disabled = true;
      const prevLabel = btn.textContent;
      btn.textContent = "Finding\u2026";
      status.textContent = "";
      status.className = "geo-status";
      results.innerHTML = "";
      results.hidden = true;
      try {
        const matches = await geocodeQuery(query);
        if (!matches.length) {
          status.textContent = "No matches \u2014 try a fuller address";
          status.className = "geo-status error";
        } else if (matches.length === 1) {
          applyGeoMatch(id, matches[0]);
        } else {
          results.hidden = false;
          matches.forEach((m) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "geo-result-item";
            row.textContent = m.display_name;
            row.addEventListener("click", () => applyGeoMatch(id, m));
            results.appendChild(row);
          });
          status.textContent = "Pick the closest match:";
        }
      } catch (e) {
        console.error(e);
        status.textContent = "Couldn't reach the map lookup \u2014 check your connection";
        status.className = "geo-status error";
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    });
  }

  GEO_FIELDS.forEach(setupGeoField);

  // ---------- Generic bottom-sheet helpers ----------
  function openSheet(backdropId) {
    document.getElementById(backdropId).hidden = false;
  }
  function closeSheet(backdropId) {
    document.getElementById(backdropId).hidden = true;
  }

  // ---------- Trip form ----------
  const tripForm = document.getElementById("tripForm");
  const tripNameInput = document.getElementById("tripName");
  const tripStartInput = document.getElementById("tripStart");
  const tripEndInput = document.getElementById("tripEnd");
  const dateTrigger = document.getElementById("dateTrigger");
  const dateTriggerLabel = document.getElementById("dateTriggerLabel");

  function loadTripFormFromState() {
    tripNameInput.value = state.trip.name || "";
    tripStartInput.value = state.trip.start || "";
    tripEndInput.value = state.trip.end || "";
    updateDateTriggerLabel();
    renderTripSummary();
  }

  function updateDateTriggerLabel() {
    if (tripStartInput.value && tripEndInput.value) {
      dateTriggerLabel.textContent = `${formatShortDate(tripStartInput.value)} \u2013 ${formatShortDate(tripEndInput.value)}`;
      dateTriggerLabel.classList.remove("placeholder");
    } else {
      dateTriggerLabel.textContent = "Choose your dates";
      dateTriggerLabel.classList.add("placeholder");
    }
  }

  function renderTripSummary() {
    const { name, start, end } = state.trip;
    document.getElementById("tripNameDisplay").textContent = name || "Trip Planner";
    const summary = document.getElementById("tripSummary");
    if (start && end) {
      summary.hidden = false;
      document.getElementById("summaryDates").textContent = `${formatShortDate(start)} \u2013 ${formatShortDate(end)}`;
      const count = tripDays().length;
      document.getElementById("summaryDayCount").textContent = count > 0 ? `${count} day${count === 1 ? "" : "s"}` : "End date is before start date";
    } else {
      summary.hidden = true;
    }
  }

  tripForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const start = tripStartInput.value;
    const end = tripEndInput.value;
    if (!start || !end) {
      showToast("Pick your trip dates first");
      return;
    }
    if (end < start) {
      showToast("End date is before the start date");
      return;
    }
    state.trip = { name: tripNameInput.value.trim(), start, end };
    saveState();
    renderTripSummary();
    showToast("Trip saved");
  });

  document.getElementById("resetAllBtn").addEventListener("click", () => {
    if (confirm("Clear all trip data on this device? This can't be undone.")) {
      state = defaultState();
      saveState();
      loadTripFormFromState();
      renderAllItemsList();
      renderPlan();
      resetItemForm();
      showToast("All data cleared");
    }
  });

  // ---------- Calendar range picker ----------
  let calViewMonth = new Date(); // first-of-month being displayed
  let calTempStart = null; // "YYYY-MM-DD" or null
  let calTempEnd = null;

  dateTrigger.addEventListener("click", () => {
    calTempStart = tripStartInput.value || null;
    calTempEnd = tripEndInput.value || null;
    calViewMonth = calTempStart ? startOfMonth(parseDateOnly(calTempStart)) : startOfMonth(new Date());
    renderCalendar();
    openSheet("calBackdrop");
  });

  document.getElementById("calClose").addEventListener("click", () => closeSheet("calBackdrop"));
  document.getElementById("calBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "calBackdrop") closeSheet("calBackdrop");
  });

  document.getElementById("calPrev").addEventListener("click", () => {
    calViewMonth = addMonths(calViewMonth, -1);
    renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", () => {
    calViewMonth = addMonths(calViewMonth, 1);
    renderCalendar();
  });

  document.getElementById("calClear").addEventListener("click", () => {
    calTempStart = null;
    calTempEnd = null;
    renderCalendar();
  });

  document.getElementById("calDone").addEventListener("click", () => {
    if (calTempStart && !calTempEnd) calTempEnd = calTempStart;
    if (calTempStart && calTempEnd) {
      tripStartInput.value = calTempStart;
      tripEndInput.value = calTempEnd;
      updateDateTriggerLabel();
    }
    closeSheet("calBackdrop");
  });

  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

  function renderCalendar() {
    const label = calViewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    document.getElementById("calMonthLabel").textContent = label;

    const grid = document.getElementById("calGrid");
    grid.innerHTML = "";

    const year = calViewMonth.getFullYear();
    const month = calViewMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayStr = isoDate(new Date());

    const cells = [];
    for (let i = firstWeekday - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, otherMonth: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, otherMonth: false, dateStr: isoDate(new Date(year, month, d)) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: cells.length, otherMonth: true });
    }

    cells.forEach((cell) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day";
      btn.textContent = cell.day;

      if (cell.otherMonth) {
        btn.classList.add("other-month");
        btn.disabled = true;
      } else {
        if (cell.dateStr === todayStr) btn.classList.add("today");
        if (calTempStart && cell.dateStr === calTempStart) btn.classList.add("range-start");
        if (calTempEnd && cell.dateStr === calTempEnd) btn.classList.add("range-end");
        if (calTempStart && calTempEnd && cell.dateStr > calTempStart && cell.dateStr < calTempEnd) {
          btn.classList.add("in-range");
        }
        btn.addEventListener("click", () => onCalDayClick(cell.dateStr));
      }
      grid.appendChild(btn);
    });

    const hint = document.getElementById("calHint");
    if (calTempStart && calTempEnd) {
      hint.textContent = `${formatShortDate(calTempStart)} \u2013 ${formatShortDate(calTempEnd)}`;
    } else if (calTempStart) {
      hint.textContent = "Now tap an end date.";
    } else {
      hint.textContent = "Tap a start date, then an end date.";
    }
  }

  function onCalDayClick(dateStr) {
    if (!calTempStart || (calTempStart && calTempEnd)) {
      calTempStart = dateStr;
      calTempEnd = null;
    } else if (dateStr < calTempStart) {
      calTempStart = dateStr;
    } else {
      calTempEnd = dateStr;
    }
    renderCalendar();
  }

  // ---------- Add-item form ----------
  const segmented = document.getElementById("typeSegmented");
  const itemForm = document.getElementById("itemForm");
  const itemTypeInput = document.getElementById("itemType");
  const itemIdInput = document.getElementById("itemId");
  const itemSubmitBtn = document.getElementById("itemSubmitBtn");
  const itemCancelEdit = document.getElementById("itemCancelEdit");

  segmented.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    setActiveType(btn.dataset.type);
  });

  function setActiveType(type) {
    itemTypeInput.value = type;
    segmented.querySelectorAll(".seg-btn").forEach((b) => {
      const active = b.dataset.type === type;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    itemForm.querySelectorAll(".type-fields").forEach((f) => {
      f.hidden = f.dataset.fields !== type;
    });
  }

  function resetItemForm() {
    itemForm.reset();
    itemIdInput.value = "";
    GEO_FIELDS.forEach(clearGeoField);
    setActiveType(itemTypeInput.value || "flight");
    itemSubmitBtn.textContent = "Add to trip";
    itemCancelEdit.hidden = true;
  }

  itemCancelEdit.addEventListener("click", resetItemForm);

  function collectFieldsForType(type) {
    switch (type) {
      case "flight": {
        const fromGeo = geoData("f_from");
        const toGeo = geoData("f_to");
        return {
          airline: val("f_airline"), number: val("f_number"),
          from: val("f_from"), to: val("f_to"),
          fromLat: fromGeo.lat, fromLon: fromGeo.lon,
          toLat: toGeo.lat, toLon: toGeo.lon,
          depart: val("f_depart"), arrive: val("f_arrive"),
          confirmation: val("f_conf")
        };
      }
      case "car": {
        const puGeo = geoData("c_pickupLoc");
        const doGeo = geoData("c_dropoffLoc");
        return {
          company: val("c_company"),
          pickupLoc: val("c_pickupLoc"), pickupLat: puGeo.lat, pickupLon: puGeo.lon, pickupTime: val("c_pickupTime"),
          dropoffLoc: val("c_dropoffLoc"), dropoffLat: doGeo.lat, dropoffLon: doGeo.lon, dropoffTime: val("c_dropoffTime"),
          confirmation: val("c_conf")
        };
      }
      case "stay": {
        const geo = geoData("s_address");
        return {
          name: val("s_name"), address: val("s_address"), lat: geo.lat, lon: geo.lon,
          checkin: val("s_checkin"), checkout: val("s_checkout"),
          confirmation: val("s_conf")
        };
      }
      case "activity": {
        const geo = geoData("a_location");
        return {
          title: val("a_title"), location: val("a_location"), lat: geo.lat, lon: geo.lon,
          time: val("a_time"), category: val("a_category")
        };
      }
    }
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v || "";
  }

  function fieldsToFormType(type, fields) {
    if (type === "flight") {
      setVal("f_airline", fields.airline); setVal("f_number", fields.number);
      setVal("f_from", fields.from); setVal("f_to", fields.to);
      restoreGeoField("f_from", fields.fromLat, fields.fromLon);
      restoreGeoField("f_to", fields.toLat, fields.toLon);
      setVal("f_depart", fields.depart); setVal("f_arrive", fields.arrive);
      setVal("f_conf", fields.confirmation);
    } else if (type === "car") {
      setVal("c_company", fields.company);
      setVal("c_pickupLoc", fields.pickupLoc); restoreGeoField("c_pickupLoc", fields.pickupLat, fields.pickupLon);
      setVal("c_pickupTime", fields.pickupTime);
      setVal("c_dropoffLoc", fields.dropoffLoc); restoreGeoField("c_dropoffLoc", fields.dropoffLat, fields.dropoffLon);
      setVal("c_dropoffTime", fields.dropoffTime);
      setVal("c_conf", fields.confirmation);
    } else if (type === "stay") {
      setVal("s_name", fields.name);
      setVal("s_address", fields.address); restoreGeoField("s_address", fields.lat, fields.lon);
      setVal("s_checkin", fields.checkin); setVal("s_checkout", fields.checkout);
      setVal("s_conf", fields.confirmation);
    } else if (type === "activity") {
      setVal("a_title", fields.title);
      setVal("a_location", fields.location); restoreGeoField("a_location", fields.lat, fields.lon);
      setVal("a_time", fields.time); setVal("a_category", fields.category || "Place");
    }
  }

  function deriveTitle(type, fields) {
    if (type === "flight") return [fields.airline, fields.number].filter(Boolean).join(" ") || "Flight";
    if (type === "car") return fields.company || "Car rental";
    if (type === "stay") return fields.name || "Stay";
    if (type === "activity") return fields.title || "Activity";
    return "Item";
  }

  function deriveMeta(type, fields) {
    if (type === "flight") {
      const route = [fields.from, fields.to].filter(Boolean).join(" \u2192 ");
      const times = [formatDateTimeShort(fields.depart), fields.arrive ? formatTime(fields.arrive) : ""].filter(Boolean).join(" \u2013 ");
      return [route, times].filter(Boolean).join(" \u00B7 ");
    }
    if (type === "car") {
      const pu = fields.pickupLoc ? `Pick up: ${fields.pickupLoc}` : "";
      const time = formatDateTimeShort(fields.pickupTime);
      return [pu, time].filter(Boolean).join(" \u00B7 ");
    }
    if (type === "stay") {
      const ci = fields.checkin ? `Check in ${formatDateTimeShort(fields.checkin)}` : "";
      const co = fields.checkout ? `out ${formatDateTimeShort(fields.checkout)}` : "";
      return [ci, co].filter(Boolean).join(" \u00B7 ");
    }
    if (type === "activity") {
      return [fields.location, fields.time].filter(Boolean).join(" \u00B7 ");
    }
    return "";
  }

  // Which date does this item naturally belong to, if any (used to prefill assignment)
  function deriveDefaultDate(type, fields) {
    const src = type === "flight" ? fields.depart
      : type === "car" ? fields.pickupTime
      : type === "stay" ? fields.checkin
      : null;
    if (!src) return null;
    const d = new Date(src);
    if (isNaN(d)) return null;
    return isoDate(d);
  }

  // The item's "natural" time as an HH:MM 24h string, for the time-input and default display
  function deriveDefaultTimeHHMM(type, fields) {
    const src = type === "flight" ? fields.depart
      : type === "car" ? fields.pickupTime
      : type === "stay" ? fields.checkin
      : null;
    if (type === "activity") return fields.time || "";
    if (!src) return "";
    const match = /T(\d{2}:\d{2})/.exec(src);
    return match ? match[1] : "";
  }

  itemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = itemTypeInput.value;
    const fields = collectFieldsForType(type);
    const notes = val("itemNotes");
    const editingId = itemIdInput.value;

    const title = deriveTitle(type, fields);

    if (editingId) {
      const item = state.items.find((i) => i.id === editingId);
      if (item) {
        item.type = type;
        item.fields = fields;
        item.title = title;
        item.notes = notes;
      }
      showToast("Updated");
    } else {
      const suggestedDate = deriveDefaultDate(type, fields);
      const days = tripDays();
      const autoDate = suggestedDate && days.includes(suggestedDate) ? suggestedDate : null;
      state.items.push({
        id: uid(),
        type,
        title,
        fields,
        notes,
        date: autoDate,
        timeOverride: null,
        order: Date.now()
      });
      showToast(autoDate ? `Added and placed on ${formatShortDate(autoDate)}` : "Added to trip");
    }

    saveState();
    resetItemForm();
    renderAllItemsList();
  });

  function startEditItem(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    itemIdInput.value = item.id;
    setActiveType(item.type);
    fieldsToFormType(item.type, item.fields);
    document.getElementById("itemNotes").value = item.notes || "";
    itemSubmitBtn.textContent = "Save changes";
    itemCancelEdit.hidden = false;
    switchView("add");
    document.getElementById("itemForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deleteItem(id) {
    if (!confirm("Remove this item from your trip?")) return;
    state.items = state.items.filter((i) => i.id !== id);
    saveState();
    renderAllItemsList();
    renderPlan();
  }

  // ---------- Render: All items list (Add tab) ----------
  function renderAllItemsList() {
    const container = document.getElementById("allItemsList");
    container.innerHTML = "";

    if (state.items.length === 0) {
      container.innerHTML = `<p class="empty-hint">Nothing added yet — use the form above to add your first flight, car, stay, or activity.</p>`;
      return;
    }

    const sorted = [...state.items].sort((a, b) => {
      if (!!a.date !== !!b.date) return a.date ? -1 : 1;
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.order - b.order;
    });

    for (const item of sorted) {
      const row = document.createElement("div");
      row.className = "item-row";
      const badge = item.date
        ? `<span class="item-day-badge">${formatShortDate(item.date)}</span>`
        : `<span class="item-day-badge unscheduled">Not scheduled</span>`;
      row.innerHTML = `
        <div class="item-tag ${item.type}">${TYPE_ICONS[item.type]}</div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-meta">${escapeHtml(deriveMeta(item.type, item.fields))}</div>
          ${item.notes ? `<div class="item-meta">${escapeHtml(item.notes)}</div>` : ""}
          ${badge}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-edit="${item.id}" title="Edit">\u270E</button>
          <button class="icon-btn danger" data-delete="${item.id}" title="Delete">\u2715</button>
        </div>
      `;
      container.appendChild(row);
    }

    container.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => startEditItem(b.dataset.edit)));
    container.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", () => deleteItem(b.dataset.delete)));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---------- Render: Plan tab ----------
  let sortableInstances = [];

  function stubTimeLabel(item) {
    if (item.timeOverride) return formatHHMM(item.timeOverride);
    if (item.type === "flight") return formatTime(item.fields.depart);
    if (item.type === "car") return formatTime(item.fields.pickupTime);
    if (item.type === "stay") return formatTime(item.fields.checkin);
    if (item.type === "activity") return item.fields.time ? formatHHMM(item.fields.time) : "";
    return "";
  }

  function buildStub(item) {
    const el = document.createElement("div");
    el.className = `stub ${item.type}`;
    el.dataset.id = item.id;
    const time = stubTimeLabel(item);
    el.innerHTML = `
      <div class="stub-time">${time || ""}</div>
      <div class="stub-body">
        <div class="stub-title">${TYPE_ICONS[item.type]} ${escapeHtml(item.title)}</div>
        <div class="stub-meta">${escapeHtml(deriveMeta(item.type, item.fields))}</div>
        ${item.notes ? `<div class="stub-meta">${escapeHtml(item.notes)}</div>` : ""}
      </div>
      <div class="stub-edit-hint" aria-hidden="true">&#8250;</div>
    `;
    el.addEventListener("click", () => openEditSheet(item.id));
    return el;
  }

  function renderPlan() {
    const days = tripDays();
    const daysContainer = document.getElementById("daysContainer");
    const noTripMsg = document.getElementById("noTripMessage");
    const tray = document.getElementById("unassignedList");

    sortableInstances.forEach((s) => s.destroy());
    sortableInstances = [];

    daysContainer.innerHTML = "";
    tray.innerHTML = "";

    noTripMsg.hidden = days.length !== 0;

    // Unassigned tray
    const unassigned = state.items
      .filter((i) => !i.date)
      .sort((a, b) => a.order - b.order);
    unassigned.forEach((item) => tray.appendChild(buildStub(item)));

    sortableInstances.push(new Sortable(tray, {
      group: "planner",
      animation: 150,
      delay: 80,
      delayOnTouchOnly: true,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      onEnd: handleDragEnd
    }));

    // Day blocks
    days.forEach((dateStr, idx) => {
      const block = document.createElement("div");
      block.className = "day-block";
      block.innerHTML = `
        <div class="day-heading">
          <span class="day-name">Day ${idx + 1}</span>
          <span class="day-date">${formatDayLabel(dateStr)}</span>
        </div>
        <div class="drop-zone day-zone" data-date="${dateStr}"></div>
      `;
      daysContainer.appendChild(block);

      const zone = block.querySelector(".day-zone");
      const dayItems = state.items
        .filter((i) => i.date === dateStr)
        .sort((a, b) => a.order - b.order);
      dayItems.forEach((item) => zone.appendChild(buildStub(item)));

      sortableInstances.push(new Sortable(zone, {
        group: "planner",
        animation: 150,
        delay: 80,
        delayOnTouchOnly: true,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        onEnd: handleDragEnd
      }));
    });
  }

  function applyZoneOrder(zone) {
    const date = zone.dataset.date || null;
    const ids = Array.from(zone.children).map((c) => c.dataset.id);
    ids.forEach((id, index) => {
      const item = state.items.find((i) => i.id === id);
      if (!item) return;
      item.date = date || null;
      item.order = index;
    });
  }

  function handleDragEnd(evt) {
    applyZoneOrder(evt.to);
    if (evt.from && evt.from !== evt.to) applyZoneOrder(evt.from);
    saveState();
  }

  // ---------- Plan-tab inline edit sheet ----------
  let editingItemId = null;

  function openEditSheet(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    editingItemId = id;
    document.getElementById("editSheetTitle").textContent = `Edit ${TYPE_LABELS[item.type].toLowerCase()}`;
    document.getElementById("edit_title").value = item.title || "";
    const timeVal = item.timeOverride || deriveDefaultTimeHHMM(item.type, item.fields);
    document.getElementById("edit_time").value = timeVal || "";
    document.getElementById("edit_notes").value = item.notes || "";
    openSheet("editBackdrop");
  }

  document.getElementById("editClose").addEventListener("click", () => closeSheet("editBackdrop"));
  document.getElementById("editBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "editBackdrop") closeSheet("editBackdrop");
  });

  document.getElementById("editSave").addEventListener("click", () => {
    if (!editingItemId) return;
    const item = state.items.find((i) => i.id === editingItemId);
    if (!item) return;

    const newTitle = document.getElementById("edit_title").value.trim();
    if (newTitle) item.title = newTitle;

    const timeVal = document.getElementById("edit_time").value;
    const naturalTime = deriveDefaultTimeHHMM(item.type, item.fields);
    item.timeOverride = (timeVal && timeVal !== naturalTime) ? timeVal : null;

    item.notes = document.getElementById("edit_notes").value.trim();

    saveState();
    closeSheet("editBackdrop");
    renderPlan();
    renderAllItemsList();
    showToast("Saved");
  });

  document.getElementById("editDelete").addEventListener("click", () => {
    if (!editingItemId) return;
    if (!confirm("Remove this item from your trip?")) return;
    state.items = state.items.filter((i) => i.id !== editingItemId);
    saveState();
    closeSheet("editBackdrop");
    renderPlan();
    renderAllItemsList();
  });

  document.getElementById("editFullForm").addEventListener("click", () => {
    if (!editingItemId) return;
    const id = editingItemId;
    closeSheet("editBackdrop");
    startEditItem(id);
  });

  // ---------- Map tab ----------
  const TYPE_COLORS = { flight: "#2F5C4E", car: "#6E8B3E", stay: "#3E6B4A", activity: "#5C9142" };
  let leafletMap = null;
  let markerLayer = null;

  function ensureMap() {
    if (leafletMap || typeof L === "undefined") return;
    leafletMap = L.map("mapContainer", { scrollWheelZoom: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(leafletMap);
    markerLayer = L.layerGroup().addTo(leafletMap);
    leafletMap.setView([20, 0], 2);
  }

  function collectMapMarkers(filter) {
    const markers = [];
    state.items.forEach((item) => {
      if (filter === "unscheduled" && item.date) return;
      if (filter && filter !== "all" && filter !== "unscheduled" && item.date !== filter) return;

      const dateLabel = item.date ? formatShortDate(item.date) : "Not scheduled";

      if (item.type === "flight") {
        if (item.fields.fromLat && item.fields.fromLon) {
          markers.push({ lat: +item.fields.fromLat, lon: +item.fields.fromLon, type: "flight",
            title: `${item.title} \u2014 Departure`, sub: item.fields.from, dateLabel });
        }
        if (item.fields.toLat && item.fields.toLon) {
          markers.push({ lat: +item.fields.toLat, lon: +item.fields.toLon, type: "flight",
            title: `${item.title} \u2014 Arrival`, sub: item.fields.to, dateLabel });
        }
      } else if (item.type === "car") {
        if (item.fields.pickupLat && item.fields.pickupLon) {
          markers.push({ lat: +item.fields.pickupLat, lon: +item.fields.pickupLon, type: "car",
            title: `${item.title} \u2014 Pick-up`, sub: item.fields.pickupLoc, dateLabel });
        }
        if (item.fields.dropoffLat && item.fields.dropoffLon) {
          markers.push({ lat: +item.fields.dropoffLat, lon: +item.fields.dropoffLon, type: "car",
            title: `${item.title} \u2014 Drop-off`, sub: item.fields.dropoffLoc, dateLabel });
        }
      } else if (item.type === "stay") {
        if (item.fields.lat && item.fields.lon) {
          markers.push({ lat: +item.fields.lat, lon: +item.fields.lon, type: "stay",
            title: item.title, sub: item.fields.address, dateLabel });
        }
      } else if (item.type === "activity") {
        if (item.fields.lat && item.fields.lon) {
          markers.push({ lat: +item.fields.lat, lon: +item.fields.lon, type: "activity",
            title: item.title, sub: item.fields.location, dateLabel });
        }
      }
    });
    return markers;
  }

  function populateMapDayFilter() {
    const select = document.getElementById("mapDayFilter");
    const prevValue = select.value;
    select.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "all"; optAll.textContent = "All days";
    select.appendChild(optAll);
    tripDays().forEach((d, idx) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = `Day ${idx + 1} \u2014 ${formatShortDate(d)}`;
      select.appendChild(opt);
    });
    const optUn = document.createElement("option");
    optUn.value = "unscheduled"; optUn.textContent = "Not yet scheduled";
    select.appendChild(optUn);
    const stillValid = Array.from(select.options).some((o) => o.value === prevValue);
    select.value = stillValid ? prevValue : "all";
  }

  function drawMapMarkers() {
    if (!leafletMap) return;
    const filter = document.getElementById("mapDayFilter").value || "all";
    const markers = collectMapMarkers(filter);
    markerLayer.clearLayers();

    const emptyState = document.getElementById("mapEmptyState");
    const mapEl = document.getElementById("mapContainer");

    if (markers.length === 0) {
      emptyState.hidden = false;
      mapEl.style.display = "none";
      return;
    }
    emptyState.hidden = true;
    mapEl.style.display = "block";
    leafletMap.invalidateSize();

    const bounds = [];
    markers.forEach((m) => {
      const marker = L.circleMarker([m.lat, m.lon], {
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: TYPE_COLORS[m.type],
        fillOpacity: 1
      }).addTo(markerLayer);
      marker.bindPopup(
        `<div class="map-popup-title">${escapeHtml(m.title)}</div>` +
        (m.sub ? `<div class="map-popup-meta">${escapeHtml(m.sub)}</div>` : "") +
        `<div class="map-popup-meta">${escapeHtml(m.dateLabel)}</div>`
      );
      bounds.push([m.lat, m.lon]);
    });

    if (bounds.length === 1) {
      leafletMap.setView(bounds[0], 13);
    } else {
      leafletMap.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  function renderMap() {
    ensureMap();
    populateMapDayFilter();
    drawMapMarkers();
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 60);
  }

  document.getElementById("mapDayFilter").addEventListener("change", drawMapMarkers);

  // ---------- PDF export ----------
  document.getElementById("exportBtn").addEventListener("click", exportPdf);

  function exportPdf() {
    if (!window.jspdf) {
      showToast("PDF library failed to load — check your connection");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 54;
    let y = 60;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const forest = [22, 52, 42];
    const lime = [124, 181, 84];
    const muted = [107, 117, 104];

    function ensureSpace(need) {
      if (y + need > pageHeight - 50) {
        doc.addPage();
        y = 60;
      }
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...forest);
    doc.text(state.trip.name || "Trip Itinerary", marginX, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...muted);
    if (state.trip.start && state.trip.end) {
      doc.text(`${formatShortDate(state.trip.start)} \u2013 ${formatShortDate(state.trip.end)}`, marginX, y);
    }
    y += 10;
    doc.setDrawColor(...lime);
    doc.setLineWidth(1.5);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 26;

    const days = tripDays();

    if (days.length === 0) {
      doc.setTextColor(...forest);
      doc.setFontSize(12);
      doc.text("No trip dates set yet.", marginX, y);
    }

    days.forEach((dateStr, idx) => {
      const dayItems = state.items.filter((i) => i.date === dateStr).sort((a, b) => a.order - b.order);
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...forest);
      doc.text(`Day ${idx + 1} \u2014 ${formatDayLabel(dateStr)}`, marginX, y);
      y += 18;

      if (dayItems.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10.5);
        doc.setTextColor(...muted);
        doc.text("Nothing planned yet", marginX + 10, y);
        y += 20;
      } else {
        dayItems.forEach((item) => {
          ensureSpace(46);
          const time = stubTimeLabel(item);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...forest);
          const titleLine = (time ? `${time}  \u2013  ` : "") + `${TYPE_LABELS[item.type]}: ${item.title}`;
          doc.text(titleLine, marginX + 10, y);
          y += 14;

          const meta = deriveMeta(item.type, item.fields);
          if (meta) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9.5);
            doc.setTextColor(...muted);
            const metaLines = doc.splitTextToSize(meta, pageWidth - marginX * 2 - 10);
            metaLines.forEach((line) => { ensureSpace(12); doc.text(line, marginX + 10, y); y += 12; });
          }
          if (item.notes) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(9.5);
            doc.setTextColor(...muted);
            const noteLines = doc.splitTextToSize(item.notes, pageWidth - marginX * 2 - 10);
            noteLines.forEach((line) => { ensureSpace(12); doc.text(line, marginX + 10, y); y += 12; });
          }
          y += 8;
        });
      }
      y += 6;
    });

    const unscheduled = state.items.filter((i) => !i.date);
    if (unscheduled.length > 0) {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...forest);
      doc.text("Not yet scheduled", marginX, y);
      y += 18;
      unscheduled.forEach((item) => {
        ensureSpace(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...forest);
        doc.text(`${TYPE_LABELS[item.type]}: ${item.title}`, marginX + 10, y);
        y += 14;
        const meta = deriveMeta(item.type, item.fields);
        if (meta) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(...muted);
          doc.text(meta, marginX + 10, y);
          y += 14;
        }
        y += 6;
      });
    }

    const filenameBase = (state.trip.name || "trip-itinerary").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    doc.save(`${filenameBase || "trip-itinerary"}.pdf`);
  }

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
    });
  }

  // ---------- Init ----------
  loadTripFormFromState();
  renderAllItemsList();
  setActiveType("flight");
})();
