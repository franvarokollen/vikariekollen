// ============================================================
// views/settings.js — Coordinator "Inställningar" (Settings)
// VK.views.settings(container, ctx)
// ============================================================

(function () {
  'use strict';

  const VK = (window.VK = window.VK || {});
  VK.views = VK.views || {};

  // Local i18n
  const LOCAL = {
    sv: {
      pageTitle:       'Inställningar',
      infoNote:        'Läge och tid styr matchning och erbjudanden direkt. Kanaler och mallar aktiveras när SMS/e-post-integration är live.',
      // Plugin status
      sectionPlugin:     'Plugin-status',
      pluginNote:        'Visar om VK kör inbäddat i Frånvarokollen (pluggad) eller som fristående demo — byts utan omladdning.',
      pluginPluggedIn:   'Pluggad i Frånvarokollen',
      pluginStandalone:  'Fristående demo',
      pluginSavedMsg:    'Plugin-läge uppdaterat',
      // Subjects & duties
      sectionSubjects:   'Ämnen & tjänster',
      subjectsIntro:     'Ämnen styr behörighetsmatchning. Tjänster (t.ex. rastvakt) bortser från behörighet — alla kandidater markeras som kvalificerade.',
      subjectTypeTeach:  'Ämne',
      subjectTypeDuty:   'Tjänst',
      subjectPlaceholder:'Nytt ämne…',
      subjectAddBtn:     'Lägg till',
      subjectDutyNote:   'Tjänst — frånser behörighet',
      subjectRemovedMsg: 'Ämne/tjänst borttaget',
      subjectAddedMsg:   'Ämne/tjänst tillagt',
      sectionMode:     'Standardläge för erbjudanden',
      modeAdmin:       'Admin tillsätter',
      modeAdminDesc:   'Koordinatorn väljer och tillsätter vikarie manuellt.',
      modePool:        'Öppen pool',
      modePoolDesc:    'Alla aktiva vikarier ser lediga pass och kan tacka ja.',
      modeCascade:     'Kaskad',
      modeCascadeDesc: 'Erbjudanden skickas i tur och ordning nedåt i rankinglistan.',
      sectionStep:        'Kaskad – tid per steg',
      stepNote:           'Hur länge varje vikarie har på sig att svara innan erbjudandet vidarebefordras.',
      stepUnit:           'min',
      stepCustomLabel:    'Anpassad',
      stepCustomUnit:     'Enhet',
      stepUnitMinutes:    'minuter',
      stepUnitHours:      'timmar',
      stepUnitDays:       'dagar',
      stepCustomSaved:    'Tid per steg sparad',
      stepCurrentValue:   'Nuvarande:',
      stepCascadeNote:    'Kort tid = brådskande (snabbt svar krävs). Lång tid = ingen brådska — erbjudandet kan ligga i dagar.',
      // Cover source tier list
      sectionSource:      'Täckningskälla — prioritetsordning',
      sourceIntro:        'Dra ordningen och slå på/av vilka grupper som kontaktas, och i vilken ordning.',
      tierLabelInternal:  'Intern personal',
      tierDescInternal:   'Egen personal med håltimme. Billigast.',
      tierLabelFvkActive: 'Aktiva FVK-vikarier',
      tierDescFvkActive:  'Vikarier som är aktiverade i Frånvarokollen.',
      tierLabelVkSubs:    'VK-vikarier',
      tierDescVkSubs:     'Vikarier som registrerat sig via Vikariekollen.',
      tierLabelFvkInactive: 'Inaktiva FVK-vikarier',
      tierDescFvkInactive:  'Kända men ej aktiverade — sista utväg.',
      tierOn:             'På',
      tierOff:            'Av',
      tierSavedMsg:       'Prioritetsordning sparad',
      tierErrorMsg:       'Kunde inte spara ordning: ',
      // Automation level
      sectionAutomation:     'Automationsnivå',
      automationNote:        'Styr i vilken grad systemet agerar utan att koordinatorn godkänner varje steg.',
      autoManual:            'Manuell',
      autoManualDesc:        'Koordinatorn väljer och skickar varje förfrågan. Full kontroll, mest handpåläggning.',
      autoAssisted:          'Assisterad',
      autoAssistedDesc:      'Systemet föreslår och rankar; koordinatorn godkänner och skickar. Rekommenderat.',
      autoAuto:              'Automatisk',
      autoAutoDesc:          'Systemet skickar och eskalerar förfrågningar automatiskt enligt reglerna.',
      autoAutoWarn:          'Pass kan bokas utan att en koordinator godkänner varje steg.',
      // Wait-time visibility
      sectionWaitTime:       'Väntetid för vikarien',
      waitTimeLabel:         'Visa väntetid för vikarien',
      waitTimeNote:          'Om på: vikarien ser i efterhand hur länge ett erbjudande låg hos dem innan det gick vidare. Kan uppmuntra snabbare svar, men kan av vissa upplevas som press.',
      waitTimeSaved:         'Väntetidsinställning sparad',
      // Channels / templates
      sectionChannels: 'Kanaler',
      channelNote:     'Väljer hur erbjudanden levereras (GatewayAPI SMS / Resend e-post) när integrationen är klar.',
      labelSms:        'SMS',
      labelEmail:      'E-post',
      sectionTemplates:'Mallar',
      templateNote:    'Tillgängliga tokens: {vikarie}, {ämne}, {klass}, {datum}, {tid}, {länk}. Matar SMS/e-post-integrationen när den är klar.',
      labelSms2:       'SMS-mall',
      labelEmail2:     'E-postmall',
      saveBtn:         'Spara inställningar',
      savedMsg:        'Inställningar sparade',
      errorMsg:        'Kunde inte spara: ',
    },
    en: {
      pageTitle:       'Settings',
      infoNote:        'Mode and step govern matching and offers immediately. Channels and templates activate once the SMS/email integration is live.',
      // Plugin status
      sectionPlugin:     'Plugin status',
      pluginNote:        'Shows whether VK runs embedded in Frånvarokollen (plugged in) or as a standalone demo — hot-swappable without reload.',
      pluginPluggedIn:   'Plugged in to Frånvarokollen',
      pluginStandalone:  'Standalone demo',
      pluginSavedMsg:    'Plugin mode updated',
      // Subjects & duties
      sectionSubjects:   'Subjects & duties',
      subjectsIntro:     'Subjects drive qualification matching. Duties (e.g. yard duty) waive qualification — all candidates are marked qualified.',
      subjectTypeTeach:  'Subject',
      subjectTypeDuty:   'Duty',
      subjectPlaceholder:'New subject…',
      subjectAddBtn:     'Add',
      subjectDutyNote:   'Duty — waives qualification',
      subjectRemovedMsg: 'Subject/duty removed',
      subjectAddedMsg:   'Subject/duty added',
      sectionMode:     'Default offer mode',
      modeAdmin:       'Admin assigns',
      modeAdminDesc:   'The coordinator picks and assigns a substitute manually.',
      modePool:        'Open pool',
      modePoolDesc:    'All active substitutes can see open gaps and accept them.',
      modeCascade:     'Cascade',
      modeCascadeDesc: 'Offers cascade down the ranked list one by one.',
      sectionStep:        'Cascade – time per step',
      stepNote:           'How long each substitute has to respond before the offer moves to the next.',
      stepUnit:           'min',
      stepCustomLabel:    'Custom',
      stepCustomUnit:     'Unit',
      stepUnitMinutes:    'minutes',
      stepUnitHours:      'hours',
      stepUnitDays:       'days',
      stepCustomSaved:    'Time per step saved',
      stepCurrentValue:   'Current:',
      stepCascadeNote:    'Short = urgent (quick response required). Long = no rush — the offer can sit for days.',
      // Cover source tier list
      sectionSource:      'Cover source — priority order',
      sourceIntro:        'Set the order and toggle which groups are contacted, and in what order.',
      tierLabelInternal:  'Internal staff',
      tierDescInternal:   'Your own staff with a free period. Cheapest.',
      tierLabelFvkActive: 'Active FVK subs',
      tierDescFvkActive:  'Substitutes activated in Frånvarokollen.',
      tierLabelVkSubs:    'VK subs',
      tierDescVkSubs:     'Substitutes who signed up via Vikariekollen.',
      tierLabelFvkInactive: 'Inactive FVK subs',
      tierDescFvkInactive:  'Known but not activated — last resort.',
      tierOn:             'On',
      tierOff:            'Off',
      tierSavedMsg:       'Priority order saved',
      tierErrorMsg:       'Could not save order: ',
      // Automation level
      sectionAutomation:     'Automation level',
      automationNote:        'Controls how far the system acts without the coordinator approving each step.',
      autoManual:            'Manual',
      autoManualDesc:        'The coordinator picks and sends every request. Full control, most hands-on.',
      autoAssisted:          'Assisted',
      autoAssistedDesc:      'The system suggests and ranks; the coordinator approves and sends. Recommended.',
      autoAuto:              'Automatic',
      autoAutoDesc:          'The system sends and escalates requests automatically according to the rules.',
      autoAutoWarn:          'Covers can be booked without a coordinator approving each step.',
      // Wait-time visibility
      sectionWaitTime:       'Substitute wait time',
      waitTimeLabel:         'Show substitutes their wait time',
      waitTimeNote:          'When on: the substitute can see, after the fact, how long an offer was with them before it moved on. May encourage faster responses, but some may experience it as pressure.',
      waitTimeSaved:         'Wait-time setting saved',
      // Channels / templates
      sectionChannels: 'Channels',
      channelNote:     'Sets how offers are delivered (GatewayAPI SMS / Resend email) once integration is wired.',
      labelSms:        'SMS',
      labelEmail:      'Email',
      sectionTemplates:'Templates',
      templateNote:    'Available tokens: {vikarie}, {ämne}, {klass}, {datum}, {tid}, {länk}. Feeds the SMS/email integration when it is ready.',
      labelSms2:       'SMS template',
      labelEmail2:     'Email template',
      saveBtn:         'Save settings',
      savedMsg:        'Settings saved',
      errorMsg:        'Could not save: ',
    },
  };

  function T(k) { return (LOCAL[VK.lang.get()] || LOCAL.sv)[k] || k; }

  VK.views.settings = function settings(container, ctx) {
    const { el, Adapter, components } = ctx;

    const s = Adapter.getSchoolSettings();

    // Default tiers — fallback if adapter returns nothing valid
    const DEFAULT_TIERS = [
      { key: 'internal_staff', enabled: true  },
      { key: 'fvk_active',     enabled: true  },
      { key: 'vk_subs',        enabled: true  },
      { key: 'fvk_inactive',   enabled: false },
    ];

    function _cloneTiers(tiers) {
      return (Array.isArray(tiers) && tiers.length === 4)
        ? tiers.map(function (t) { return { key: t.key, enabled: !!t.enabled }; })
        : DEFAULT_TIERS.map(function (t) { return { key: t.key, enabled: t.enabled }; });
    }

    // Mutable working copy (avoids live mutation before save)
    let draft = {
      coverOfferMode:    s.coverOfferMode  || 'admin_assign',
      stepMinutes:       s.stepMinutes     || 30,
      channels: {
        sms:   !!(s.channels && s.channels.sms),
        email: !!(s.channels && s.channels.email),
      },
      smsTemplate:       s.smsTemplate     || '',
      emailTemplate:     s.emailTemplate   || '',
      coverSourceTiers:  _cloneTiers(s.coverSourceTiers),
      automationLevel:   s.automationLevel || 'assisted',
      showSubWaitTime:   !!(s.showSubWaitTime),
    };

    // ── Info note ────────────────────────────────────────────
    const infoNote = el('div', { className: 'settings-info-note' },
      el('span', { className: 'settings-info-icon' }, 'ℹ'),
      T('infoNote')
    );

    // ── Section: Offer mode ──────────────────────────────────
    const MODE_OPTIONS = [
      { value: 'admin_assign', label: T('modeAdmin') },
      { value: 'open_pool',   label: T('modePool')  },
      { value: 'cascade',     label: T('modeCascade') },
    ];
    const modeExplainers = {
      admin_assign: T('modeAdminDesc'),
      open_pool:    T('modePoolDesc'),
      cascade:      T('modeCascadeDesc'),
    };

    const modeExplainerEl = el('div', { className: 'settings-explainer' },
      modeExplainers[draft.coverOfferMode]
    );

    const modeControl = components.segmentedControl(MODE_OPTIONS, draft.coverOfferMode, function (val) {
      draft.coverOfferMode = val;
      modeExplainerEl.textContent = modeExplainers[val];
      // cascade step row: show/hide
      stepSection.style.display = val === 'cascade' ? '' : 'none';
    });

    const modeSection = el('div', { className: 'settings-card' },
      el('div', { className: 'settings-section-title' }, T('sectionMode')),
      modeControl,
      modeExplainerEl
    );

    // ── Section: Cascade step (presets + custom) ─────────────
    // Preset chips: minutes values
    const STEP_PRESETS = [
      { minutes: 15,    labelSv: '15 min',  labelEn: '15 min'  },
      { minutes: 30,    labelSv: '30 min',  labelEn: '30 min'  },
      { minutes: 60,    labelSv: '1 tim',   labelEn: '1 hr'    },
      { minutes: 240,   labelSv: '4 tim',   labelEn: '4 hr'    },
      { minutes: 1440,  labelSv: '1 dag',   labelEn: '1 day'   },
      { minutes: 2880,  labelSv: '2 dagar', labelEn: '2 days'  },
      { minutes: 4320,  labelSv: '3 dagar', labelEn: '3 days'  },
      { minutes: 10080, labelSv: '1 vecka', labelEn: '1 week'  },
    ];

    function _presetLabel(p) {
      return VK.lang.get() === 'en' ? p.labelEn : p.labelSv;
    }

    function _presetsMatchDraft() {
      return STEP_PRESETS.find(function (p) { return p.minutes === draft.stepMinutes; }) || null;
    }

    const stepCurrentEl = el('div', { className: 'settings-step-current' });

    function _updateStepCurrent() {
      const dur = VK.fmt.dur(draft.stepMinutes * 60000);
      stepCurrentEl.textContent = T('stepCurrentValue') + ' ' + dur;
    }
    _updateStepCurrent();

    // Preset chip row
    const presetRowEl = el('div', { className: 'settings-step-presets' });

    function _renderPresets() {
      while (presetRowEl.firstChild) presetRowEl.removeChild(presetRowEl.firstChild);
      const matched = _presetsMatchDraft();
      STEP_PRESETS.forEach(function (p) {
        const isActive = matched && matched.minutes === p.minutes;
        const chip = el('button', {
          className: 'settings-step-chip' + (isActive ? ' active' : ''),
          onclick: function () {
            draft.stepMinutes = p.minutes;
            const res = Adapter.updateSchoolSettings({ stepMinutes: p.minutes });
            if (res.ok) {
              components.confirmToast(T('stepCustomSaved'), 'green');
              _updateStepCurrent();
              _renderPresets();
              _updateCustomReflection();
            }
          },
        }, _presetLabel(p));
        presetRowEl.appendChild(chip);
      });
    }
    _renderPresets();

    // Custom row
    const customNumInput = el('input', {
      type: 'number',
      className: 'settings-step-custom-num',
      min: '1', max: '20160',
      value: '',
    });
    const customUnitSelect = el('select', { className: 'settings-step-custom-unit' },
      el('option', { value: 'minutes' }, T('stepUnitMinutes')),
      el('option', { value: 'hours'   }, T('stepUnitHours')),
      el('option', { value: 'days'    }, T('stepUnitDays'))
    );
    const customSaveBtn = el('button', {
      className: 'btn btn-ghost-border btn-sm',
      onclick: function () {
        const rawNum  = parseInt(customNumInput.value, 10);
        const unit    = customUnitSelect.value;
        if (!rawNum || rawNum < 1) return;
        let minutes = rawNum;
        if (unit === 'hours') minutes = rawNum * 60;
        if (unit === 'days')  minutes = rawNum * 1440;
        minutes = Math.min(20160, Math.max(1, minutes));
        draft.stepMinutes = minutes;
        const res = Adapter.updateSchoolSettings({ stepMinutes: minutes });
        if (res.ok) {
          components.confirmToast(T('stepCustomSaved'), 'green');
          _updateStepCurrent();
          _renderPresets();
          customNumInput.value = '';
        }
      },
    }, VK.t('save'));

    // If current stepMinutes doesn't match any preset, pre-fill custom row
    function _updateCustomReflection() {
      if (!_presetsMatchDraft()) {
        // Reflect in custom row: pick sensible unit
        const mins = draft.stepMinutes;
        if (mins % 1440 === 0 && mins >= 1440) {
          customNumInput.value     = mins / 1440;
          customUnitSelect.value   = 'days';
        } else if (mins % 60 === 0 && mins >= 60) {
          customNumInput.value     = mins / 60;
          customUnitSelect.value   = 'hours';
        } else {
          customNumInput.value     = mins;
          customUnitSelect.value   = 'minutes';
        }
      } else {
        customNumInput.value = '';
      }
    }
    _updateCustomReflection();

    const customRow = el('div', { className: 'settings-step-custom-row' },
      el('span', { className: 'settings-step-custom-label' }, T('stepCustomLabel')),
      customNumInput,
      customUnitSelect,
      customSaveBtn
    );

    const stepSection = el('div', {
      className: 'settings-card',
      style: draft.coverOfferMode === 'cascade' ? '' : 'display:none',
    },
      el('div', { className: 'settings-section-title' }, T('sectionStep')),
      stepCurrentEl,
      presetRowEl,
      customRow,
      el('div', { className: 'settings-note' }, T('stepCascadeNote'))
    );

    // ── Section: Plugin status ───────────────────────────────
    const pluginStatusEl = el('span', { className: 'settings-plugin-value' });
    function _updatePluginStatusEl() {
      const mode = Adapter.getPluginMode();
      pluginStatusEl.textContent = mode === 'plugged_in' ? T('pluginPluggedIn') : T('pluginStandalone');
      pluginStatusEl.className = 'settings-plugin-value settings-plugin-value--' + mode;
    }
    _updatePluginStatusEl();

    const PLUGIN_OPTS = [
      { value: 'plugged_in',  label: T('pluginPluggedIn')  },
      { value: 'standalone',  label: T('pluginStandalone') },
    ];
    const pluginControl = components.segmentedControl(
      PLUGIN_OPTS,
      Adapter.getPluginMode(),
      function (val) {
        Adapter.setPluginMode(val);
        _updatePluginStatusEl();
        components.confirmToast(T('pluginSavedMsg'), 'green');
      }
    );

    const pluginSection = el('div', { className: 'settings-card settings-plugin-card' },
      el('div', { className: 'settings-plugin-header' },
        el('div', { className: 'settings-section-title' }, T('sectionPlugin')),
        pluginControl
      ),
      el('div', { className: 'settings-note' }, T('pluginNote'))
    );

    // ── Section: Subjects & duties ───────────────────────────
    const subjectsListEl = el('div', { className: 'settings-subjects-list' });
    const subjectAddInput = el('input', {
      type: 'text',
      className: 'settings-subject-input',
      placeholder: T('subjectPlaceholder'),
    });
    const subjectAddError = el('div', { className: 'settings-subject-add-error' });

    // toggle starts on 'teaching'
    let _subjectAddType = 'teaching';
    const subjectTypeControl = components.segmentedControl(
      [
        { value: 'teaching', label: T('subjectTypeTeach') },
        { value: 'duty',     label: T('subjectTypeDuty')  },
      ],
      'teaching',
      function (val) { _subjectAddType = val; }
    );

    function _renderSubjectsList() {
      while (subjectsListEl.firstChild) subjectsListEl.removeChild(subjectsListEl.firstChild);
      const subjects = Adapter.listSubjects();
      if (subjects.length === 0) {
        subjectsListEl.appendChild(
          el('div', { className: 'settings-subjects-empty' }, '—')
        );
        return;
      }
      subjects.forEach(function (subj) {
        const isDuty = subj.type === 'duty';
        const chip = el('div', { className: 'settings-subject-chip' + (isDuty ? ' settings-subject-chip--duty' : ' settings-subject-chip--teaching') },
          el('span', { className: 'settings-subject-chip-label' }, subj.name),
          isDuty ? el('span', { className: 'settings-subject-chip-type' }, T('subjectTypeDuty')) : null,
          el('button', {
            className: 'settings-subject-remove',
            title: 'Ta bort',
            onclick: function () {
              const res = Adapter.removeSubject(subj.name);
              if (res.ok) {
                components.confirmToast(T('subjectRemovedMsg'), 'green');
                _renderSubjectsList();
              } else {
                components.confirmToast(res.error || 'Fel', 'amber');
              }
            },
          }, '×')
        );
        subjectsListEl.appendChild(chip);
      });
    }
    _renderSubjectsList();

    const subjectAddBtn = el('button', {
      className: 'btn btn-primary btn-sm settings-subject-add-btn',
      onclick: function () {
        subjectAddError.textContent = '';
        const name = subjectAddInput.value.trim();
        const res = Adapter.addSubject(name, _subjectAddType);
        if (res.ok) {
          subjectAddInput.value = '';
          components.confirmToast(T('subjectAddedMsg'), 'green');
          _renderSubjectsList();
        } else {
          subjectAddError.textContent = res.error || 'Fel';
        }
      },
    }, T('subjectAddBtn'));

    // also allow Enter in the input
    subjectAddInput.onkeydown = function (e) {
      if (e.key === 'Enter') subjectAddBtn.click();
    };

    const subjectsSection = el('div', { className: 'settings-card' },
      el('div', { className: 'settings-section-title' }, T('sectionSubjects')),
      el('div', { className: 'settings-note' }, T('subjectsIntro')),
      subjectsListEl,
      el('div', { className: 'settings-subject-add-row' },
        subjectAddInput,
        subjectTypeControl,
        subjectAddBtn
      ),
      subjectAddError
    );

    // ── Section: Cover source — tier list ────────────────────
    // Tier key → label + description i18n keys
    const TIER_META = {
      internal_staff: { labelKey: 'tierLabelInternal',   descKey: 'tierDescInternal'   },
      fvk_active:     { labelKey: 'tierLabelFvkActive',  descKey: 'tierDescFvkActive'  },
      vk_subs:        { labelKey: 'tierLabelVkSubs',     descKey: 'tierDescVkSubs'     },
      fvk_inactive:   { labelKey: 'tierLabelFvkInactive',descKey: 'tierDescFvkInactive'},
    };

    // Container that gets rebuilt on every tier change
    const tierListEl = el('div', { className: 'settings-tier-list' });

    function _saveTiers() {
      const result = Adapter.updateSchoolSettings({ coverSourceTiers: draft.coverSourceTiers });
      if (result.ok) {
        components.confirmToast(T('tierSavedMsg'), 'green');
      } else {
        components.confirmToast(T('tierErrorMsg') + (result.error || ''), 'amber');
      }
    }

    function _renderTierList() {
      // Clear and rebuild in-place
      while (tierListEl.firstChild) tierListEl.removeChild(tierListEl.firstChild);

      const tiers = draft.coverSourceTiers;
      const enabledCount = tiers.filter(function (t) { return t.enabled; }).length;
      // Priority numbers count only enabled tiers in order
      let enabledRank = 0;

      tiers.forEach(function (tier, idx) {
        const meta = TIER_META[tier.key] || { labelKey: tier.key, descKey: '' };
        const isFirst = idx === 0;
        const isLast  = idx === tiers.length - 1;
        const isLastResort = tier.key === 'fvk_inactive';

        if (tier.enabled) enabledRank++;
        const rankLabel = tier.enabled ? String(enabledRank) : '—';

        // ▲ button
        const upBtn = el('button', {
          className: 'settings-tier-btn' + (isFirst ? ' disabled' : ''),
          title: 'Flytta upp',
          onclick: isFirst ? null : function () {
            const copy = draft.coverSourceTiers.slice();
            const tmp = copy[idx - 1];
            copy[idx - 1] = copy[idx];
            copy[idx]     = tmp;
            draft.coverSourceTiers = copy;
            _saveTiers();
            _renderTierList();
          },
        }, '▲');
        if (isFirst) upBtn.setAttribute('disabled', 'true');

        // ▼ button
        const downBtn = el('button', {
          className: 'settings-tier-btn' + (isLast ? ' disabled' : ''),
          title: 'Flytta ned',
          onclick: isLast ? null : function () {
            const copy = draft.coverSourceTiers.slice();
            const tmp = copy[idx + 1];
            copy[idx + 1] = copy[idx];
            copy[idx]     = tmp;
            draft.coverSourceTiers = copy;
            _saveTiers();
            _renderTierList();
          },
        }, '▼');
        if (isLast) downBtn.setAttribute('disabled', 'true');

        // Enable toggle (checkbox-based pill)
        const toggleId = 'vk-tier-toggle-' + tier.key;
        const toggleInput = el('input', {
          type: 'checkbox',
          id: toggleId,
          className: 'settings-toggle-input',
        });
        toggleInput.checked = tier.enabled;
        toggleInput.onchange = function () {
          draft.coverSourceTiers[idx] = { key: tier.key, enabled: this.checked };
          _saveTiers();
          _renderTierList();
        };

        const toggleEl = el('label', {
          className: 'settings-tier-toggle',
          for: toggleId,
        },
          toggleInput,
          el('span', { className: 'settings-toggle-track' },
            el('span', { className: 'settings-toggle-thumb' })
          )
        );

        // Last-resort note for fvk_inactive
        const lastResortNote = isLastResort
          ? el('span', { className: 'settings-tier-last-resort' }, '⚑ sista utväg')
          : null;

        const row = el('div', {
          className: 'settings-tier-row' + (tier.enabled ? '' : ' settings-tier-row--disabled'),
        },
          el('div', { className: 'settings-tier-rank' }, rankLabel),
          el('div', { className: 'settings-tier-info' },
            el('div', { className: 'settings-tier-label' },
              T(meta.labelKey),
              lastResortNote
            ),
            el('div', { className: 'settings-tier-desc' }, T(meta.descKey))
          ),
          toggleEl,
          el('div', { className: 'settings-tier-arrows' }, upBtn, downBtn)
        );

        tierListEl.appendChild(row);
      });
    }

    _renderTierList();

    const sourceSection = el('div', { className: 'settings-card' },
      el('div', { className: 'settings-section-title' }, T('sectionSource')),
      el('div', { className: 'settings-note' }, T('sourceIntro')),
      tierListEl
    );

    // ── Section: Automation level ──────────────────────────────
    const AUTO_OPTIONS = [
      { value: 'manual',   labelKey: 'autoManual',   descKey: 'autoManualDesc',   warn: false },
      { value: 'assisted', labelKey: 'autoAssisted', descKey: 'autoAssistedDesc', warn: false },
      { value: 'auto',     labelKey: 'autoAuto',     descKey: 'autoAutoDesc',     warn: true  },
    ];

    const autoCards = {};
    const autoList = el('div', { className: 'settings-option-list' });
    AUTO_OPTIONS.forEach(function (opt) {
      const radio = el('input', {
        type: 'radio',
        name: 'automationLevel',
        value: opt.value,
        className: 'settings-option-radio',
      });
      radio.checked = opt.value === draft.automationLevel;

      const cardChildren = [
        radio,
        el('div', { className: 'settings-option-content' },
          el('div', { className: 'settings-option-label' }, T(opt.labelKey)),
          el('div', { className: 'settings-option-desc' }, T(opt.descKey))
        ),
      ];

      if (opt.warn) {
        cardChildren.push(
          el('div', { className: 'settings-auto-warn' },
            el('span', { className: 'settings-auto-warn-icon' }, '⚠'),
            T('autoAutoWarn')
          )
        );
      }

      const card = el('div', {
        className: 'settings-option-card' +
          (opt.warn ? ' settings-option-card--warn' : '') +
          (opt.value === draft.automationLevel ? ' selected' : ''),
      }, ...cardChildren);

      // Make the whole card clickable by wrapping in a label-like click
      card.style.cursor = 'pointer';
      card.addEventListener('click', function (e) {
        // avoid double-firing when the radio itself is clicked
        if (e.target === radio) return;
        radio.checked = true;
        draft.automationLevel = opt.value;
        AUTO_OPTIONS.forEach(function (o) {
          if (autoCards[o.value]) {
            autoCards[o.value].classList.toggle('selected', o.value === opt.value);
          }
        });
      });
      radio.onchange = function () {
        if (this.checked) {
          draft.automationLevel = opt.value;
          AUTO_OPTIONS.forEach(function (o) {
            if (autoCards[o.value]) autoCards[o.value].classList.toggle('selected', o.value === opt.value);
          });
        }
      };

      autoCards[opt.value] = card;
      autoList.appendChild(card);
    });

    const automationSection = el('div', { className: 'settings-card' },
      el('div', { className: 'settings-section-title' }, T('sectionAutomation')),
      el('div', { className: 'settings-note' }, T('automationNote')),
      autoList
    );

    // ── Section: Wait-time visibility ────────────────────────
    // Saved immediately on toggle (no pending draft — binary flag).
    const waitTimeToggleId = 'vk-toggle-showSubWaitTime';
    const waitTimeInput = el('input', {
      type: 'checkbox',
      id: waitTimeToggleId,
      className: 'settings-toggle-input',
    });
    waitTimeInput.checked = draft.showSubWaitTime;
    waitTimeInput.onchange = function () {
      draft.showSubWaitTime = this.checked;
      const res = Adapter.updateSchoolSettings({ showSubWaitTime: draft.showSubWaitTime });
      if (res && res.ok) {
        components.confirmToast(T('waitTimeSaved'), 'green');
      }
    };

    const waitTimeSection = el('div', { className: 'settings-card' },
      el('div', { className: 'settings-section-title' }, T('sectionWaitTime')),
      el('label', { className: 'settings-toggle-row', for: waitTimeToggleId },
        waitTimeInput,
        el('span', { className: 'settings-toggle-track' },
          el('span', { className: 'settings-toggle-thumb' })
        ),
        el('span', { className: 'settings-toggle-label' }, T('waitTimeLabel'))
      ),
      el('div', { className: 'settings-note settings-wait-time-note' }, T('waitTimeNote'))
    );

    // ── Section: Channels ────────────────────────────────────
    function buildToggle(labelKey, checked, onChange) {
      const id = 'vk-toggle-' + labelKey;
      const input = el('input', {
        type: 'checkbox',
        id: id,
        className: 'settings-toggle-input',
      });
      input.checked = checked;
      input.onchange = function () { onChange(this.checked); };
      return el('label', { className: 'settings-toggle-row', for: id },
        input,
        el('span', { className: 'settings-toggle-track' },
          el('span', { className: 'settings-toggle-thumb' })
        ),
        el('span', { className: 'settings-toggle-label' }, T(labelKey))
      );
    }

    const channelsSection = el('div', { className: 'settings-card' },
      el('div', { className: 'settings-section-title' }, T('sectionChannels')),
      el('div', { className: 'settings-toggles' },
        buildToggle('labelSms',   draft.channels.sms,   function (v) { draft.channels.sms = v; }),
        buildToggle('labelEmail', draft.channels.email, function (v) { draft.channels.email = v; })
      ),
      el('div', { className: 'settings-note' }, T('channelNote'))
    );

    // ── Section: Templates ───────────────────────────────────
    const smsTa = el('textarea', {
      className: 'settings-textarea',
      rows: '4',
      oninput: function () { draft.smsTemplate = this.value; },
    });
    smsTa.value = draft.smsTemplate;

    const emailTa = el('textarea', {
      className: 'settings-textarea',
      rows: '5',
      oninput: function () { draft.emailTemplate = this.value; },
    });
    emailTa.value = draft.emailTemplate;

    const templatesSection = el('div', { className: 'settings-card' },
      el('div', { className: 'settings-section-title' }, T('sectionTemplates')),
      el('div', { className: 'settings-note settings-note-tokens' }, T('templateNote')),
      el('div', { className: 'settings-field' },
        el('label', { className: 'settings-label' }, T('labelSms2')),
        smsTa
      ),
      el('div', { className: 'settings-field' },
        el('label', { className: 'settings-label' }, T('labelEmail2')),
        emailTa
      )
    );

    // ── Save button ──────────────────────────────────────────
    const saveBtn = el('button', {
      className: 'btn btn-primary settings-save-btn',
      onclick: function () {
        const result = Adapter.updateSchoolSettings({
          coverOfferMode:  draft.coverOfferMode,
          stepMinutes:     draft.stepMinutes,
          channels:        { sms: draft.channels.sms, email: draft.channels.email },
          smsTemplate:     draft.smsTemplate,
          emailTemplate:   draft.emailTemplate,
          automationLevel:  draft.automationLevel,
          showSubWaitTime:  draft.showSubWaitTime,
          // coverSourceTiers saved immediately on each tier change; omit here
        });
        if (result.ok) {
          components.confirmToast(T('savedMsg'), 'green');
        } else {
          components.confirmToast(T('errorMsg') + (result.error || ''), 'amber');
        }
      },
    }, T('saveBtn'));

    const wrap = el('div', { className: 'settings-page' },
      el('div', { className: 'settings-page-title' }, T('pageTitle')),
      infoNote,
      pluginSection,
      subjectsSection,
      sourceSection,
      modeSection,
      stepSection,
      automationSection,
      waitTimeSection,
      channelsSection,
      templatesSection,
      el('div', { className: 'settings-actions' }, saveBtn)
    );

    container.appendChild(wrap);
  };

}());
