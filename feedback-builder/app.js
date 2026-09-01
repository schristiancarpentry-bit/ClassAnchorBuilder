/* ClassAnchor Feedback Builder — app logic */
(function () {
  "use strict";

  var FD = window.FeedbackData;
  var STATE_KEY = "fb_state_v1";
  var LIBRARY_KEY = "fb_library_v1";
  var saveTimer = null;

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------
  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function clamp10(n) {
    n = Math.round(Number(n));
    if (isNaN(n)) return 5;
    return Math.max(1, Math.min(10, n));
  }

  // ---------------------------------------------------------------------
  // Library (default sliders + user overrides + custom sliders)
  // ---------------------------------------------------------------------
  var library = { overrides: {}, custom: [] };

  function loadLibrary() {
    try {
      var raw = localStorage.getItem(LIBRARY_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        library.overrides = parsed.overrides || {};
        library.custom = parsed.custom || [];
      }
    } catch (e) {
      console.warn("Could not load slider library", e);
    }
  }

  function saveLibrary() {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    } catch (e) {
      console.warn("Could not save slider library", e);
    }
  }

  // Full merged list: defaults (with overrides applied) + custom sliders.
  function getLibraryList() {
    var out = FD.DEFAULT_SLIDERS.map(function (d) {
      var o = library.overrides[d.id];
      return o ? Object.assign({}, d, o, { id: d.id, isCustom: false, isEdited: true }) : Object.assign({}, d, { isCustom: false, isEdited: false });
    });
    library.custom.forEach(function (c) {
      out.push(Object.assign({}, c, { isCustom: true }));
    });
    return out;
  }

  function getLibraryMap() {
    var map = {};
    getLibraryList().forEach(function (s) { map[s.id] = s; });
    return map;
  }

  // ---------------------------------------------------------------------
  // Class roster — a class list a tutor pastes in once and reuses across
  // many feedback-writing sessions, independent of the assessment tabs.
  // ---------------------------------------------------------------------
  var ROSTER_KEY = "fb_roster_v1";
  var roster = []; // [{ id, name, group, selected, lastExported }]

  function loadRoster() {
    try {
      var raw = localStorage.getItem(ROSTER_KEY);
      if (raw) roster = JSON.parse(raw) || [];
    } catch (e) {
      console.warn("Could not load class roster", e);
    }
  }

  function saveRoster() {
    try {
      localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
    } catch (e) {
      console.warn("Could not save class roster", e);
    }
  }

  function parseNameLines(text) {
    return String(text || "")
      .split(/\r\n|\r|\n/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function addRosterBatch(names, group) {
    var g = (group || "").trim();
    names.forEach(function (name) {
      var exists = roster.some(function (r) { return r.name === name && r.group === g; });
      if (exists) return;
      roster.push({ id: uid("student"), name: name, group: g, selected: false, lastExported: null });
    });
    saveRoster();
  }

  function rosterGroupKey(r) {
    return r.group && r.group.trim() ? r.group.trim() : "No Group";
  }

  // ---------------------------------------------------------------------
  // App state (tabs)
  // ---------------------------------------------------------------------
  var state = { tabs: [], activeTabId: null };

  function blankTab(name) {
    return {
      id: uid("tab"),
      title: null, // null = auto-derive from student name
      student: { name: "", group: "", level: "", unit: "" },
      sliders: [], // { libId, value, overrides: {value: text} }
      notes: "",
      summaryOverride: null
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.tabs && parsed.tabs.length) {
          state = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn("Could not load saved feedback data", e);
    }
    var t = blankTab();
    state = { tabs: [t], activeTabId: t.id };
  }

  function saveStateNow() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save feedback data", e);
    }
  }

  function saveStateDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStateNow, 350);
  }

  function activeTab() {
    var t = state.tabs.filter(function (t) { return t.id === state.activeTabId; })[0];
    return t || state.tabs[0];
  }

  function tabDisplayTitle(tab, index) {
    return tab.title || tab.student.name || ("Assessment " + (index + 1));
  }

  // ---------------------------------------------------------------------
  // Text generation for a slider instance
  // ---------------------------------------------------------------------
  function textForInstance(inst, libSlider, studentName) {
    if (inst.overrides && inst.overrides[inst.value] != null) return inst.overrides[inst.value];
    if (!libSlider) return "(This slider no longer exists in your library.)";
    return FD.generateSentence(libSlider, inst.value, studentName);
  }

  function buildSummary(tab) {
    if (tab.summaryOverride != null) return tab.summaryOverride;
    var libMap = getLibraryMap();
    if (!tab.sliders.length) {
      return "No assessment criteria have been added yet. Add sliders from the library on the left to build this student's feedback.";
    }
    var total = 0;
    var counts = { "not-met": 0, developing: 0, meeting: 0, exceeding: 0 };
    tab.sliders.forEach(function (inst) {
      total += inst.value;
      var band = FD.tierFor(inst.value).band;
      counts[band]++;
    });
    var avg = total / tab.sliders.length;
    var subject = FD.subjectFor(tab.student.name);
    var band = FD.overallBand(avg);
    var unitBit = tab.student.unit ? " for " + tab.student.unit : "";
    var parts = [];
    parts.push(subject + " was assessed against " + tab.sliders.length + " criteri" + (tab.sliders.length === 1 ? "on" : "a") + unitBit + ", achieving " + band.label + " (average score " + avg.toFixed(1) + "/10).");
    var strengths = tab.sliders.filter(function (i) { return i.value >= 9; });
    var focus = tab.sliders.filter(function (i) { return i.value <= 3; });
    if (strengths.length) {
      parts.push("Particular strengths were shown in: " + strengths.map(function (i) {
        var s = libMap[i.libId];
        return s ? s.name : "an unlisted criterion";
      }).join(", ") + ".");
    }
    if (focus.length) {
      parts.push("Priority areas for further development are: " + focus.map(function (i) {
        var s = libMap[i.libId];
        return s ? s.name : "an unlisted criterion";
      }).join(", ") + ".");
    }
    parts.push(counts.meeting + counts.exceeding + " of " + tab.sliders.length + " criteria met or exceeded the required standard.");
    return parts.join(" ");
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  var el = {}; // cached DOM refs, filled in init()

  function renderTabBar() {
    var html = state.tabs.map(function (tab, i) {
      var active = tab.id === state.activeTabId ? " active" : "";
      return (
        '<button type="button" class="tab-btn' + active + '" data-tab="' + tab.id + '" title="Double-click to rename">' +
        '<span class="tab-label">' + esc(tabDisplayTitle(tab, i)) + "</span>" +
        '<span class="tab-close" data-close-tab="' + tab.id + '" title="Close tab">&times;</span>' +
        "</button>"
      );
    }).join("");
    el.tabBar.innerHTML = html;
  }

  function renderPicker(tab) {
    var q = (el.pickerSearch.value || "").toLowerCase().trim();
    var activeSet = {};
    tab.sliders.forEach(function (i) { activeSet[i.libId] = true; });
    var list = getLibraryList().filter(function (s) {
      if (!q) return true;
      return (s.name + " " + (s.description || "")).toLowerCase().indexOf(q) !== -1;
    });
    var byCat = {};
    list.forEach(function (s) {
      (byCat[s.category] = byCat[s.category] || []).push(s);
    });
    var html = "";
    FD.CATEGORIES.forEach(function (cat) {
      var items = byCat[cat.id];
      if (!items || !items.length) return;
      html += '<div class="picker-cat"><h4>' + esc(cat.name) + "</h4>";
      items.forEach(function (s) {
        var added = !!activeSet[s.id];
        html +=
          '<div class="picker-item' + (added ? " added" : "") + '" data-lib-id="' + s.id + '">' +
          '<label class="picker-check" title="' + (added ? "Remove from this assessment" : "Add to this assessment") + '">' +
          '<input type="checkbox" data-toggle-lib="' + s.id + '"' + (added ? " checked" : "") + " />" +
          '<span class="picker-check-box" aria-hidden="true"></span>' +
          "</label>" +
          '<div class="picker-item-main">' +
          '<div class="picker-item-name">' + esc(s.name) + (s.isEdited ? ' <span class="tag">edited</span>' : "") + (s.isCustom ? ' <span class="tag">custom</span>' : "") + "</div>" +
          '<div class="picker-item-desc">' + esc(s.description || "") + "</div>" +
          "</div>" +
          '<div class="picker-item-actions">' +
          '<button type="button" class="link-btn" data-edit-lib="' + s.id + '" title="Edit this slider">Edit</button>' +
          (s.isCustom ? '<button type="button" class="link-btn" data-delete-lib="' + s.id + '" title="Delete custom slider">Delete</button>' : "") +
          "</div></div>";
      });
      html += "</div>";
    });
    if (!html) html = '<p class="empty-hint">No sliders match your search.</p>';
    el.pickerList.innerHTML = html;
  }

  function sliderRowHtml(tab, inst, index) {
    var libMap = getLibraryMap();
    var s = libMap[inst.libId];
    var tier = FD.tierFor(inst.value);
    var text = textForInstance(inst, s, tab.student.name);
    var overridden = inst.overrides && inst.overrides[inst.value] != null;
    var pct = ((inst.value - 1) / 9 * 100).toFixed(1);
    return (
      '<div class="slider-row" data-index="' + index + '" data-band="' + tier.band + '">' +
      '<div class="slider-row-head">' +
      '<span class="slider-row-name">' + esc(s ? s.name : "(missing slider)") + "</span>" +
      '<span class="slider-row-tier" data-role="tier">' + esc(tier.label) + " &middot; " + inst.value + "/10</span>" +
      '<button type="button" class="btn-icon" data-remove-slider title="Remove">&#128465;</button>' +
      "</div>" +
      '<input type="range" min="1" max="10" step="1" value="' + inst.value + '" class="gauge" data-role="range" style="--fill:' + pct + '%" />' +
      '<div class="gauge-ticks" aria-hidden="true">' +
        [1,2,3,4,5,6,7,8,9,10].map(function(n){return '<span>'+n+'</span>';}).join("") +
      "</div>" +
      '<p class="slider-row-text" data-role="text">' + esc(text) + "</p>" +
      '<div class="slider-row-tools">' +
      '<button type="button" class="link-btn" data-toggle-edit>' + (overridden ? "Edit wording (customised)" : "Edit wording") + "</button>" +
      (overridden ? '<button type="button" class="link-btn" data-revert-edit>Revert to generated text</button>' : "") +
      "</div>" +
      '<div class="slider-row-editor" data-role="editor" hidden>' +
      '<textarea data-role="editor-textarea" rows="3">' + esc(text) + "</textarea>" +
      '<div class="editor-actions">' +
      '<button type="button" class="btn btn-ghost" data-save-edit>Save wording</button>' +
      '<button type="button" class="btn btn-ghost" data-cancel-edit>Cancel</button>' +
      "</div></div>" +
      "</div>"
    );
  }

  function renderActiveSliders(tab) {
    if (!tab.sliders.length) {
      el.activeList.innerHTML = '<p class="empty-hint">No criteria added yet. Choose sliders from the library on the left, or create your own.</p>';
      return;
    }
    var byCat = {};
    tab.sliders.forEach(function (inst, i) {
      var s = getLibraryMap()[inst.libId];
      var cat = s ? s.category : "custom";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push({ inst: inst, index: i });
    });
    var html = "";
    FD.CATEGORIES.forEach(function (cat) {
      if (!byCat[cat.id]) return;
      html += '<div class="active-cat"><h4>' + esc(cat.name) + "</h4>";
      byCat[cat.id].forEach(function (item) {
        html += sliderRowHtml(tab, item.inst, item.index);
      });
      html += "</div>";
    });
    el.activeList.innerHTML = html;
  }

  function renderSummary(tab) {
    var text = buildSummary(tab);
    el.summaryText.textContent = text;
    el.summaryEditToggle.textContent = tab.summaryOverride != null ? "Edit summary (customised)" : "Edit summary";
    el.summaryRevert.hidden = tab.summaryOverride == null;
  }

  function renderHeaderFields(tab) {
    el.studentName.value = tab.student.name || "";
    el.studentGroup.value = tab.student.group || "";
    el.studentLevel.value = tab.student.level || "";
    el.studentUnit.value = tab.student.unit || "";
    el.notes.value = tab.notes || "";
  }

  function renderRoster() {
    var q = (el.rosterSearch.value || "").toLowerCase().trim();
    var list = roster.filter(function (r) {
      if (!q) return true;
      return (r.name + " " + r.group).toLowerCase().indexOf(q) !== -1;
    });
    var byGroup = {};
    var order = [];
    list.forEach(function (r) {
      var g = rosterGroupKey(r);
      if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
      byGroup[g].push(r);
    });
    order.sort(function (a, b) { return a === "No Group" ? 1 : b === "No Group" ? -1 : a.localeCompare(b); });

    var html = "";
    order.forEach(function (g) {
      var items = byGroup[g];
      var allSelected = items.every(function (r) { return r.selected; });
      html += '<div class="roster-group">';
      html += '<div class="roster-group-head">';
      html += '<label class="picker-check" title="Select everyone in ' + esc(g) + '">' +
        '<input type="checkbox" data-select-group="' + esc(g) + '"' + (allSelected ? " checked" : "") + " />" +
        '<span class="picker-check-box" aria-hidden="true"></span></label>';
      html += "<h4>" + esc(g) + ' <span class="roster-group-count">(' + items.length + ")</span></h4>";
      html += "</div>";
      items.forEach(function (r) {
        html +=
          '<div class="roster-row" data-id="' + r.id + '">' +
          '<label class="picker-check"><input type="checkbox" data-select-student="' + r.id + '"' + (r.selected ? " checked" : "") + ' />' +
          '<span class="picker-check-box" aria-hidden="true"></span></label>' +
          '<span class="roster-name">' + esc(r.name) + "</span>" +
          (r.lastExported ? '<span class="tag roster-exported-tag" title="Exported ' + esc(new Date(r.lastExported).toLocaleString()) + '">exported</span>' : "") +
          '<button type="button" class="link-btn" data-rename-student="' + r.id + '">Rename</button>' +
          '<button type="button" class="link-btn" data-regroup-student="' + r.id + '">Move Group</button>' +
          '<button type="button" class="btn-icon" data-remove-student="' + r.id + '" title="Remove from roster">&#128465;</button>' +
          "</div>";
      });
      html += "</div>";
    });
    if (!html) {
      html = roster.length
        ? '<p class="empty-hint">No students match your search.</p>'
        : '<p class="empty-hint">No students in your roster yet. Paste a class list above to get started.</p>';
    }
    el.rosterList.innerHTML = html;

    var selectedCount = roster.filter(function (r) { return r.selected; }).length;
    el.rosterSelectedCount.textContent = selectedCount + (selectedCount === 1 ? " student selected" : " students selected");
    el.btnExportRoster.disabled = selectedCount === 0;

    // Offer existing groups as autocomplete suggestions, so adding another
    // batch to a group already in use is a pick, not a retype (and can't
    // accidentally create a near-duplicate like "Plumbing L2" vs "plumbing l2").
    var existingGroups = Array.from(new Set(roster.map(function (r) { return r.group.trim(); }).filter(Boolean))).sort();
    el.rosterGroupsList.innerHTML = existingGroups.map(function (g) { return '<option value="' + esc(g) + '"></option>'; }).join("");
  }

  // Builds tab-shaped objects (same shape buildSummary/buildTabSection
  // expect) from the currently active tab's feedback template, one per
  // selected roster student — so the export machinery for tabs can be
  // reused unchanged for a roster batch export.
  function buildVirtualTabsForSelected() {
    var tab = activeTab();
    return roster.filter(function (r) { return r.selected; }).map(function (r) {
      return {
        student: {
          name: r.name,
          group: r.group || tab.student.group,
          level: tab.student.level,
          unit: tab.student.unit
        },
        sliders: tab.sliders.map(function (i) {
          return { libId: i.libId, value: i.value, overrides: Object.assign({}, i.overrides) };
        }),
        notes: tab.notes,
        summaryOverride: tab.summaryOverride
      };
    });
  }

  function renderAll() {
    var tab = activeTab();
    state.activeTabId = tab.id;
    renderTabBar();
    renderHeaderFields(tab);
    renderPicker(tab);
    renderActiveSliders(tab);
    renderSummary(tab);
  }

  // ---------------------------------------------------------------------
  // Targeted (non-destructive) updates while typing / dragging
  // ---------------------------------------------------------------------
  function refreshAllParagraphs() {
    var tab = activeTab();
    var libMap = getLibraryMap();
    el.activeList.querySelectorAll(".slider-row").forEach(function (row) {
      var idx = Number(row.getAttribute("data-index"));
      var inst = tab.sliders[idx];
      if (!inst) return;
      if (inst.overrides && inst.overrides[inst.value] != null) return; // don't clobber custom wording
      var s = libMap[inst.libId];
      var text = textForInstance(inst, s, tab.student.name);
      row.querySelector('[data-role="text"]').textContent = text;
    });
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  // These mutate state and save, but deliberately do NOT re-render — callers
  // choose what to redraw. This matters most for the picker checkbox: a full
  // renderAll() would replace #pickerList (and every checkbox in it) from
  // underneath the very checkbox the click event is still dispatching on,
  // which drops browser focus mid-click and can trigger an unpredictable
  // refocus/auto-scroll elsewhere on the page.
  function addSliderToTab(libId) {
    var tab = activeTab();
    if (tab.sliders.some(function (i) { return i.libId === libId; })) return;
    tab.sliders.push({ libId: libId, value: 5, overrides: {} });
    saveStateNow();
  }

  function removeSliderFromTab(index) {
    var tab = activeTab();
    tab.sliders.splice(index, 1);
    saveStateNow();
  }

  function removeSliderFromTabByLibId(libId) {
    var tab = activeTab();
    var idx = tab.sliders.findIndex(function (i) { return i.libId === libId; });
    if (idx !== -1) removeSliderFromTab(idx);
  }

  // Tick/untick from the library picker: add if not present, remove if present.
  // Returns true if the slider is now active.
  function toggleSliderInTab(libId) {
    var tab = activeTab();
    var present = tab.sliders.some(function (i) { return i.libId === libId; });
    if (present) removeSliderFromTabByLibId(libId);
    else addSliderToTab(libId);
    return !present;
  }

  function newTab(fromDuplicate) {
    var tab;
    if (fromDuplicate) {
      var src = activeTab();
      tab = blankTab();
      tab.sliders = src.sliders.map(function (i) { return { libId: i.libId, value: 5, overrides: {} }; });
    } else {
      tab = blankTab();
    }
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    saveStateNow();
    renderAll();
  }

  function closeTab(tabId) {
    if (state.tabs.length <= 1) {
      // Reset the last remaining tab instead of leaving zero tabs.
      var fresh = blankTab();
      state.tabs = [fresh];
      state.activeTabId = fresh.id;
      saveStateNow();
      renderAll();
      return;
    }
    var idx = state.tabs.findIndex(function (t) { return t.id === tabId; });
    if (idx === -1) return;
    var wasActive = state.activeTabId === tabId;
    state.tabs.splice(idx, 1);
    if (wasActive) {
      var next = state.tabs[idx] || state.tabs[idx - 1] || state.tabs[0];
      state.activeTabId = next.id;
    }
    saveStateNow();
    renderAll();
  }

  function renameTab(tabId) {
    var tab = state.tabs.filter(function (t) { return t.id === tabId; })[0];
    if (!tab) return;
    var current = tabDisplayTitle(tab, state.tabs.indexOf(tab));
    var name = window.prompt("Rename this tab:", current);
    if (name == null) return;
    tab.title = name.trim() || null;
    saveStateNow();
    renderAll();
  }

  // ---------------------------------------------------------------------
  // Custom / edit slider modal
  // ---------------------------------------------------------------------
  var modalMode = null; // "create" | "edit"
  var modalTargetId = null;

  function openModal(mode, libId) {
    modalMode = mode;
    modalTargetId = libId || null;
    var s = libId ? getLibraryMap()[libId] : null;
    el.modalTitle.textContent = mode === "edit" ? "Edit slider" : "Create your own slider";
    el.modalName.value = s ? s.name : "";
    el.modalCategory.value = s ? s.category : "custom";
    el.modalVerb.value = s ? s.verbPhrase : "";
    el.modalDesc.value = s ? s.description || "" : "";
    el.modalDelete.hidden = !(mode === "edit" && s && s.isCustom);
    el.modalResetDefault.hidden = !(mode === "edit" && s && !s.isCustom && s.isEdited);
    el.modalBackdrop.hidden = false;
    el.modalName.focus();
  }

  function closeModal() {
    el.modalBackdrop.hidden = true;
    modalMode = null;
    modalTargetId = null;
  }

  function saveModal() {
    var name = el.modalName.value.trim();
    var verb = el.modalVerb.value.trim();
    var category = el.modalCategory.value;
    var description = el.modalDesc.value.trim();
    if (!name || !verb) {
      window.alert("Please give the slider a name and describe what a top score (10) looks like.");
      return;
    }
    if (modalMode === "create") {
      var id = uid("custom");
      library.custom.push({ id: id, category: category, name: name, verbPhrase: verb, description: description });
      saveLibrary();
      addSliderToTab(id);
    } else if (modalMode === "edit" && modalTargetId) {
      var existingCustom = library.custom.filter(function (c) { return c.id === modalTargetId; })[0];
      if (existingCustom) {
        existingCustom.name = name;
        existingCustom.category = category;
        existingCustom.verbPhrase = verb;
        existingCustom.description = description;
      } else {
        library.overrides[modalTargetId] = { name: name, category: category, verbPhrase: verb, description: description };
      }
      saveLibrary();
    }
    closeModal();
    renderAll();
  }

  function deleteCustomSlider(id) {
    if (!window.confirm("Delete this custom slider from your library? It will also be removed from any tabs using it.")) return;
    library.custom = library.custom.filter(function (c) { return c.id !== id; });
    saveLibrary();
    state.tabs.forEach(function (t) {
      t.sliders = t.sliders.filter(function (i) { return i.libId !== id; });
    });
    saveStateNow();
    renderAll();
  }

  function resetSliderToDefault(id) {
    delete library.overrides[id];
    saveLibrary();
    closeModal();
    renderAll();
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------
  function bindHeaderField(input, key) {
    input.addEventListener("input", function () {
      var tab = activeTab();
      tab.student[key] = input.value;
      if (key === "name") {
        refreshAllParagraphs();
        renderSummary(tab);
        // tab bar label may need to update, but a full renderTabBar() call
        // would not steal focus from this input since it's a different element.
        renderTabBar();
      }
      saveStateDebounced();
    });
  }

  function init() {
    loadLibrary();
    loadState();
    loadRoster();

    el = {
      tabBar: document.getElementById("tabBar"),
      btnNewTab: document.getElementById("btnNewTab"),
      btnDuplicateTab: document.getElementById("btnDuplicateTab"),
      studentName: document.getElementById("studentName"),
      studentGroup: document.getElementById("studentGroup"),
      studentLevel: document.getElementById("studentLevel"),
      studentUnit: document.getElementById("studentUnit"),
      pickerSearch: document.getElementById("pickerSearch"),
      pickerList: document.getElementById("pickerList"),
      btnAddCustom: document.getElementById("btnAddCustom"),
      activeList: document.getElementById("activeList"),
      summaryText: document.getElementById("summaryText"),
      summaryEditToggle: document.getElementById("summaryEditToggle"),
      summaryRevert: document.getElementById("summaryRevert"),
      summaryEditor: document.getElementById("summaryEditor"),
      summaryTextarea: document.getElementById("summaryTextarea"),
      notes: document.getElementById("notesArea"),
      modalBackdrop: document.getElementById("modalBackdrop"),
      modalTitle: document.getElementById("modalTitle"),
      modalName: document.getElementById("modalName"),
      modalCategory: document.getElementById("modalCategory"),
      modalVerb: document.getElementById("modalVerb"),
      modalDesc: document.getElementById("modalDesc"),
      modalSave: document.getElementById("modalSave"),
      modalCancel: document.getElementById("modalCancel"),
      modalDelete: document.getElementById("modalDelete"),
      modalResetDefault: document.getElementById("modalResetDefault"),
      rosterPaste: document.getElementById("rosterPaste"),
      rosterGroupInput: document.getElementById("rosterGroupInput"),
      btnAddRoster: document.getElementById("btnAddRoster"),
      rosterSearch: document.getElementById("rosterSearch"),
      rosterSelectedCount: document.getElementById("rosterSelectedCount"),
      rosterList: document.getElementById("rosterList"),
      btnExportRoster: document.getElementById("btnExportRoster"),
      rosterGroupsList: document.getElementById("rosterGroupsList")
    };

    // Populate category <select> in modal
    el.modalCategory.innerHTML = FD.CATEGORIES.filter(function (c) { return c.id !== "custom"; })
      .concat([{ id: "custom", name: "My Sliders" }])
      .map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");

    bindHeaderField(el.studentName, "name");
    bindHeaderField(el.studentGroup, "group");
    bindHeaderField(el.studentLevel, "level");
    bindHeaderField(el.studentUnit, "unit");

    el.notes.addEventListener("input", function () {
      activeTab().notes = el.notes.value;
      saveStateDebounced();
    });

    el.btnNewTab.addEventListener("click", function () { newTab(false); });
    el.btnDuplicateTab.addEventListener("click", function () { newTab(true); });

    el.tabBar.addEventListener("click", function (e) {
      var closeBtn = e.target.closest("[data-close-tab]");
      if (closeBtn) { closeTab(closeBtn.getAttribute("data-close-tab")); return; }
      var tabBtn = e.target.closest("[data-tab]");
      if (tabBtn) {
        state.activeTabId = tabBtn.getAttribute("data-tab");
        saveStateNow();
        renderAll();
      }
    });
    el.tabBar.addEventListener("dblclick", function (e) {
      var tabBtn = e.target.closest("[data-tab]");
      if (tabBtn) renameTab(tabBtn.getAttribute("data-tab"));
    });

    el.pickerSearch.addEventListener("input", function () { renderPicker(activeTab()); });

    el.pickerList.addEventListener("click", function (e) {
      var editBtn = e.target.closest("[data-edit-lib]");
      if (editBtn) { openModal("edit", editBtn.getAttribute("data-edit-lib")); return; }
      var delBtn = e.target.closest("[data-delete-lib]");
      if (delBtn) { deleteCustomSlider(delBtn.getAttribute("data-delete-lib")); return; }
    });
    el.pickerList.addEventListener("change", function (e) {
      var toggle = e.target.closest("[data-toggle-lib]");
      if (!toggle) return;
      var nowAdded = toggleSliderInTab(toggle.getAttribute("data-toggle-lib"));
      // Targeted update only: leave #pickerList itself untouched (see comment
      // above addSliderToTab) — just flip the highlight on this one row.
      var item = toggle.closest(".picker-item");
      if (item) item.classList.toggle("added", nowAdded);
      renderActiveSliders(activeTab());
      renderSummary(activeTab());
    });

    el.btnAddCustom.addEventListener("click", function () { openModal("create"); });
    el.modalCancel.addEventListener("click", closeModal);
    el.modalSave.addEventListener("click", saveModal);
    el.modalDelete.addEventListener("click", function () {
      if (modalTargetId) deleteCustomSlider(modalTargetId);
      closeModal();
    });
    el.modalResetDefault.addEventListener("click", function () {
      if (modalTargetId) resetSliderToDefault(modalTargetId);
    });
    el.modalBackdrop.addEventListener("click", function (e) {
      if (e.target === el.modalBackdrop) closeModal();
    });

    // Active slider list: delegated events for range, remove, edit-wording.
    el.activeList.addEventListener("input", function (e) {
      var range = e.target.closest('[data-role="range"]');
      if (!range) return;
      var row = range.closest(".slider-row");
      var idx = Number(row.getAttribute("data-index"));
      var tab = activeTab();
      var inst = tab.sliders[idx];
      inst.value = clamp10(range.value);
      var s = getLibraryMap()[inst.libId];
      var tier = FD.tierFor(inst.value);
      row.setAttribute("data-band", tier.band);
      range.style.setProperty("--fill", ((inst.value - 1) / 9 * 100).toFixed(1) + "%");
      row.querySelector('[data-role="tier"]').textContent = tier.label + " · " + inst.value + "/10";
      if (!(inst.overrides && inst.overrides[inst.value] != null)) {
        row.querySelector('[data-role="text"]').textContent = textForInstance(inst, s, tab.student.name);
      } else {
        row.querySelector('[data-role="text"]').textContent = inst.overrides[inst.value];
      }
      var editorTa = row.querySelector('[data-role="editor-textarea"]');
      if (editorTa) editorTa.value = textForInstance(inst, s, tab.student.name);
      renderSummary(tab);
      saveStateDebounced();
    });

    el.activeList.addEventListener("click", function (e) {
      var row = e.target.closest(".slider-row");
      if (!row) return;
      var idx = Number(row.getAttribute("data-index"));
      var tab = activeTab();
      var inst = tab.sliders[idx];

      if (e.target.closest("[data-remove-slider]")) {
        removeSliderFromTab(idx);
        renderActiveSliders(tab);
        renderPicker(tab);
        renderSummary(tab);
        return;
      }

      if (e.target.closest("[data-toggle-edit]")) {
        var editor = row.querySelector('[data-role="editor"]');
        editor.hidden = !editor.hidden;
        return;
      }
      if (e.target.closest("[data-cancel-edit]")) {
        row.querySelector('[data-role="editor"]').hidden = true;
        return;
      }
      if (e.target.closest("[data-save-edit]")) {
        var ta = row.querySelector('[data-role="editor-textarea"]');
        inst.overrides = inst.overrides || {};
        inst.overrides[inst.value] = ta.value;
        saveStateNow();
        renderActiveSliders(tab);
        return;
      }
      if (e.target.closest("[data-revert-edit]")) {
        if (inst.overrides) delete inst.overrides[inst.value];
        saveStateNow();
        renderActiveSliders(tab);
        return;
      }
    });

    el.summaryEditToggle.addEventListener("click", function () {
      var tab = activeTab();
      var opening = el.summaryEditor.hidden;
      if (opening) {
        el.summaryTextarea.value = tab.summaryOverride != null ? tab.summaryOverride : buildSummary(tab);
      }
      el.summaryEditor.hidden = !opening;
    });
    document.getElementById("summarySave").addEventListener("click", function () {
      var tab = activeTab();
      tab.summaryOverride = el.summaryTextarea.value;
      saveStateNow();
      el.summaryEditor.hidden = true;
      renderSummary(tab);
    });
    document.getElementById("summaryCancelEdit").addEventListener("click", function () {
      el.summaryEditor.hidden = true;
    });
    el.summaryRevert.addEventListener("click", function () {
      var tab = activeTab();
      tab.summaryOverride = null;
      saveStateNow();
      renderSummary(tab);
    });

    // There are two sets of export buttons (a quick-access pair at the top of
    // the page, and the full pair at the bottom of the form) — wire up every
    // instance of each, so a tutor who never scrolls down can still export.
    document.querySelectorAll(".btn-export-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.FeedbackExport.exportTab(activeTab(), getLibraryMap(), buildSummary);
      });
    });
    document.querySelectorAll(".btn-export-all").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.FeedbackExport.exportAllTabs(state.tabs, getLibraryMap(), buildSummary, function (tab, i) { return tabDisplayTitle(tab, i); });
      });
    });

    // ---- Class roster ----
    el.btnAddRoster.addEventListener("click", function () {
      var names = parseNameLines(el.rosterPaste.value);
      if (!names.length) {
        window.alert("Paste at least one student name (one per line) first.");
        return;
      }
      addRosterBatch(names, el.rosterGroupInput.value);
      el.rosterPaste.value = "";
      renderRoster();
    });

    el.rosterSearch.addEventListener("input", renderRoster);

    el.rosterList.addEventListener("change", function (e) {
      var studentBox = e.target.closest("[data-select-student]");
      if (studentBox) {
        var r = roster.find(function (x) { return x.id === studentBox.getAttribute("data-select-student"); });
        if (r) r.selected = studentBox.checked;
        saveRoster();
        renderRoster();
        return;
      }
      var groupBox = e.target.closest("[data-select-group]");
      if (groupBox) {
        var g = groupBox.getAttribute("data-select-group");
        var checked = groupBox.checked;
        roster.forEach(function (x) { if (rosterGroupKey(x) === g) x.selected = checked; });
        saveRoster();
        renderRoster();
      }
    });

    el.rosterList.addEventListener("click", function (e) {
      var renameBtn = e.target.closest("[data-rename-student]");
      if (renameBtn) {
        var r1 = roster.find(function (x) { return x.id === renameBtn.getAttribute("data-rename-student"); });
        if (r1) {
          var newName = window.prompt("Rename student:", r1.name);
          if (newName != null && newName.trim()) { r1.name = newName.trim(); saveRoster(); renderRoster(); }
        }
        return;
      }
      var regroupBtn = e.target.closest("[data-regroup-student]");
      if (regroupBtn) {
        var r2 = roster.find(function (x) { return x.id === regroupBtn.getAttribute("data-regroup-student"); });
        if (r2) {
          var newGroup = window.prompt("Move to which group?", r2.group || "");
          if (newGroup != null) { r2.group = newGroup.trim(); saveRoster(); renderRoster(); }
        }
        return;
      }
      var removeBtn = e.target.closest("[data-remove-student]");
      if (removeBtn) {
        var id = removeBtn.getAttribute("data-remove-student");
        roster = roster.filter(function (x) { return x.id !== id; });
        saveRoster();
        renderRoster();
      }
    });

    el.btnExportRoster.addEventListener("click", function () {
      var virtualTabs = buildVirtualTabsForSelected();
      if (!virtualTabs.length) return;
      var groups = Array.from(new Set(virtualTabs.map(function (t) { return t.student.group; }).filter(Boolean)));
      var base = groups.length === 1 ? groups[0] : "Selected Students";
      window.FeedbackExport.exportAllTabs(
        virtualTabs,
        getLibraryMap(),
        buildSummary,
        function (t) { return t.student.name; },
        { filenameBase: base, docTitle: "Practical Assessment Feedback — " + base }
      );
      var now = Date.now();
      roster.forEach(function (r) { if (r.selected) r.lastExported = now; });
      saveRoster();
      renderRoster();
    });

    renderAll();
    renderRoster();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposed for testing (jsdom harness) and for docx-export.js to reuse formatting.
  window.FeedbackApp = {
    getState: function () { return state; },
    getLibraryList: getLibraryList,
    getLibraryMap: getLibraryMap,
    textForInstance: textForInstance,
    buildSummary: buildSummary,
    tabDisplayTitle: tabDisplayTitle,
    addSliderToTab: addSliderToTab,
    newTab: newTab,
    closeTab: closeTab,
    renderAll: function () { renderAll(); },
    getRoster: function () { return roster; },
    buildVirtualTabsForSelected: buildVirtualTabsForSelected,
    _init: init
  };
})();
