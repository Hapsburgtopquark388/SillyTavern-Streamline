import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { promptManager } from '../../../openai.js';

const MODULE_NAME = 'third-party/Streamline';
const SETTINGS_KEY = 'streamline';

// =====================================================================
// Default Settings
// =====================================================================

const defaultSettings = {
    // Phase 1 — Basic Hide/Disable
    hide_text_completion: false,
    hide_advanced_formatting: false,
    hide_authors_note: false,
    hide_movingui: false,
    hide_autofix_markdown: false,
    hide_advanced_samplers: false,

    // Phase 2 — Deep Clean
    hide_nsfw_jailbreak: false,
    hide_example_separator: false,
    hide_chat_start_marker: false,
    hide_context_template: false,
    hide_instruct_mode: false,
    hide_cfg_scale: false,
    hide_token_padding: false,
    hide_response_formatting: false,
    hide_talkativeness: false,
    hide_persona_position: false,
    hide_group_chat: false,

    // Phase 2.5 — Preserved values (backup store for neutralized settings)
    _preserved: {},
    // Phase 2.5 — Preserved prompt manager toggle states
    _pmPreserved: {},
    // Phase 2.5 — Whether PM fields have been soft-disabled
    _pmFieldsDisabled: false,
};

// Keys that are toggle-type (checkbox) settings
const TOGGLE_KEYS = Object.keys(defaultSettings).filter(k => !k.startsWith('_'));

// Maps setting keys to body CSS classes
const TOGGLE_MAP = {
    // Phase 1
    hide_text_completion: 'streamline--hide-text-completion',
    hide_advanced_formatting: 'streamline--hide-advanced-formatting',
    hide_authors_note: 'streamline--hide-authors-note',
    hide_movingui: 'streamline--hide-movingui',
    hide_autofix_markdown: 'streamline--hide-autofix-markdown',
    hide_advanced_samplers: 'streamline--hide-advanced-samplers',

    // Phase 2
    hide_nsfw_jailbreak: 'streamline--hide-nsfw-jailbreak',
    hide_example_separator: 'streamline--hide-example-separator',
    hide_chat_start_marker: 'streamline--hide-chat-start-marker',
    hide_context_template: 'streamline--hide-context-template',
    hide_instruct_mode: 'streamline--hide-instruct-mode',
    hide_cfg_scale: 'streamline--hide-cfg-scale',
    hide_token_padding: 'streamline--hide-token-padding',
    hide_response_formatting: 'streamline--hide-response-formatting',
    hide_talkativeness: 'streamline--hide-talkativeness',
    hide_persona_position: 'streamline--hide-persona-position',
    hide_group_chat: 'streamline--hide-group-chat',
};

// =====================================================================
// Phase 2.5 — Neutralization Definitions
// =====================================================================

/**
 * HARD neutralize — settings that are technically obsolete for cloud CC
 * narrative RP. When hidden, force these OFF unconditionally.
 */
const HARD_NEUTRALIZE = {
    hide_instruct_mode: {
        label: 'Disabled — irrelevant for cloud CC APIs',
        save() {
            const $el = $('#instruct_enabled');
            return $el.length ? $el.prop('checked') : null;
        },
        apply() {
            const $el = $('#instruct_enabled');
            if ($el.length && $el.prop('checked')) {
                $el.prop('checked', false).trigger('input');
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#instruct_enabled');
            if ($el.length) {
                $el.prop('checked', saved).trigger('input');
            }
        },
    },
    hide_cfg_scale: {
        label: 'Disabled — irrelevant for cloud APIs',
        save() {
            // CFG guidance scale for TC — read the slider value
            const $el = $('#cfg_block_ooba input[type="range"]');
            return $el.length ? parseFloat($el.val()) : null;
        },
        apply() {
            const $el = $('#cfg_block_ooba input[type="range"]');
            if ($el.length) {
                $el.val(1).trigger('input');
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#cfg_block_ooba input[type="range"]');
            if ($el.length) {
                $el.val(saved).trigger('input');
            }
        },
    },
    hide_token_padding: {
        label: 'Set to 0 — irrelevant for cloud APIs',
        save() {
            const $el = $('#token_padding');
            return $el.length ? parseInt($el.val()) : null;
        },
        apply() {
            const $el = $('#token_padding');
            if ($el.length) {
                $el.val(0).trigger('input');
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#token_padding');
            if ($el.length) {
                $el.val(saved).trigger('input');
            }
        },
    },
    hide_context_template: {
        label: 'Reset to default — irrelevant for cloud CC APIs',
        save() {
            const $el = $('#context_presets');
            return $el.length ? $el.val() : null;
        },
        apply() {
            // Context template: select the first option (default) if available
            const $el = $('#context_presets');
            if ($el.length) {
                const $defaultOpt = $el.find('option').first();
                if ($defaultOpt.length) {
                    $el.val($defaultOpt.val()).trigger('change');
                }
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#context_presets');
            if ($el.length) {
                $el.val(saved).trigger('change');
            }
        },
    },
};

/**
 * SOFT neutralize — settings where the user's system prompt handles
 * the behavior instead. When hidden, set to a neutral default.
 */
const SOFT_NEUTRALIZE = {
    hide_nsfw_jailbreak: {
        label: 'Managed by your system prompt',
        save() {
            const nsfw = $('#nsfw_prompt_quick_edit_textarea').val() || '';
            const jailbreak = $('#jailbreak_prompt_quick_edit_textarea').val() || '';
            return { nsfw, jailbreak };
        },
        apply() {
            const $nsfw = $('#nsfw_prompt_quick_edit_textarea');
            const $jb = $('#jailbreak_prompt_quick_edit_textarea');
            if ($nsfw.length) $nsfw.val('').trigger('input');
            if ($jb.length) $jb.val('').trigger('input');
        },
        restore(saved) {
            if (!saved) return;
            const $nsfw = $('#nsfw_prompt_quick_edit_textarea');
            const $jb = $('#jailbreak_prompt_quick_edit_textarea');
            if ($nsfw.length && saved.nsfw) $nsfw.val(saved.nsfw).trigger('input');
            if ($jb.length && saved.jailbreak) $jb.val(saved.jailbreak).trigger('input');
        },
    },
    hide_talkativeness: {
        label: 'Managed by your system prompt',
        save() {
            const $el = $('#talkativeness_slider');
            return $el.length ? parseFloat($el.val()) : null;
        },
        apply() {
            const $el = $('#talkativeness_slider');
            if ($el.length) {
                $el.val(1.0).trigger('input');
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#talkativeness_slider');
            if ($el.length) {
                $el.val(saved).trigger('input');
            }
        },
    },
    hide_example_separator: {
        label: 'Managed by your system prompt',
        save() {
            const $el = $('#context_example_separator');
            return $el.length ? $el.val() : null;
        },
        apply() {
            const $el = $('#context_example_separator');
            if ($el.length) $el.val('').trigger('input');
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#context_example_separator');
            if ($el.length) $el.val(saved).trigger('input');
        },
    },
    hide_chat_start_marker: {
        label: 'Managed by your system prompt',
        save() {
            const $el = $('#context_chat_start');
            return $el.length ? $el.val() : null;
        },
        apply() {
            const $el = $('#context_chat_start');
            if ($el.length) $el.val('').trigger('input');
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#context_chat_start');
            if ($el.length) $el.val(saved).trigger('input');
        },
    },
};

// All neutralizable keys
const ALL_NEUTRALIZE_KEYS = new Set([
    ...Object.keys(HARD_NEUTRALIZE),
    ...Object.keys(SOFT_NEUTRALIZE),
]);

// =====================================================================
// Phase 2.5 — Prompt Manager Field Toggling
// =====================================================================

/**
 * Prompt manager fields to DISABLE when Apply Narrative Defaults is used.
 * The user's system prompt handles what these fields were designed for.
 */
const PM_FIELDS_TO_DISABLE = [
    'charDescription',
    'charPersonality',
    'scenario',
    'enhanceDefinitions',
    'nsfw',
    'dialogueExamples',
    'jailbreak',
];

/**
 * Prompt manager fields to LEAVE ENABLED.
 */
const PM_FIELDS_TO_KEEP = [
    'main',
    'personaDescription',
    'worldInfoBefore',
    'worldInfoAfter',
    'chatHistory',
];

/**
 * Get the prompt manager's active character, if available.
 * @returns {object|null}
 */
function getPMActiveCharacter() {
    if (!promptManager) return null;
    return promptManager.activeCharacter || null;
}

/**
 * Read current enabled states for all PM fields we manage.
 * @returns {Object<string, boolean>} Map of identifier → enabled state
 */
function readPMFieldStates() {
    const character = getPMActiveCharacter();
    if (!character || !promptManager) return {};

    const states = {};
    for (const id of [...PM_FIELDS_TO_DISABLE, ...PM_FIELDS_TO_KEEP]) {
        const entry = promptManager.getPromptOrderEntry(character, id);
        if (entry) {
            states[id] = entry.enabled;
        }
    }
    return states;
}

/**
 * Set enabled state for specific PM fields.
 * @param {Object<string, boolean>} stateMap Map of identifier → desired enabled state
 */
function setPMFieldStates(stateMap) {
    const character = getPMActiveCharacter();
    if (!character || !promptManager) return;

    let changed = false;
    for (const [id, enabled] of Object.entries(stateMap)) {
        const entry = promptManager.getPromptOrderEntry(character, id);
        if (entry && entry.enabled !== enabled) {
            entry.enabled = enabled;
            changed = true;
        }
    }

    if (changed) {
        promptManager.saveServiceSettings();
        try {
            promptManager.render();
        } catch (e) {
            // Render might fail if prompt manager isn't fully initialized yet
            console.warn('[Streamline] PM render skipped:', e.message);
        }
    }
}

/**
 * Soft-disable PM fields: save current states, then disable the target fields.
 */
function disablePMFields() {
    const settings = extension_settings[SETTINGS_KEY];

    // Save current states before changing
    const currentStates = readPMFieldStates();
    if (Object.keys(currentStates).length > 0) {
        settings._pmPreserved = currentStates;
    }

    // Disable the target fields
    const newStates = {};
    for (const id of PM_FIELDS_TO_DISABLE) {
        newStates[id] = false;
    }
    setPMFieldStates(newStates);

    settings._pmFieldsDisabled = true;
    saveSettingsDebounced();
}

/**
 * Restore PM fields to their previously saved states.
 */
function restorePMFields() {
    const settings = extension_settings[SETTINGS_KEY];

    if (settings._pmPreserved && Object.keys(settings._pmPreserved).length > 0) {
        setPMFieldStates(settings._pmPreserved);
        settings._pmPreserved = {};
    }

    settings._pmFieldsDisabled = false;
    saveSettingsDebounced();
}

// =====================================================================
// Phase 2.5 — Neutralize / Restore Logic
// =====================================================================

/**
 * Preserve the current value of a setting before neutralizing.
 * @param {string} key The toggle key
 */
function preserveValue(key) {
    const settings = extension_settings[SETTINGS_KEY];
    if (!settings._preserved) settings._preserved = {};

    const hardDef = HARD_NEUTRALIZE[key];
    const softDef = SOFT_NEUTRALIZE[key];
    const def = hardDef || softDef;

    if (def) {
        // Only preserve if we haven't already (don't overwrite a previous backup)
        if (settings._preserved[key] === undefined) {
            settings._preserved[key] = def.save();
        }
    }
}

/**
 * Apply neutralization for a specific key.
 * @param {string} key The toggle key
 */
function neutralize(key) {
    const hardDef = HARD_NEUTRALIZE[key];
    const softDef = SOFT_NEUTRALIZE[key];

    if (hardDef) {
        hardDef.apply();
    } else if (softDef) {
        softDef.apply();
    }
}

/**
 * Restore a previously preserved value for a specific key.
 * @param {string} key The toggle key
 * @returns {boolean} Whether a value was actually restored
 */
function restoreValue(key) {
    const settings = extension_settings[SETTINGS_KEY];
    if (!settings._preserved) return false;

    const saved = settings._preserved[key];
    if (saved === undefined) return false;

    const hardDef = HARD_NEUTRALIZE[key];
    const softDef = SOFT_NEUTRALIZE[key];
    const def = hardDef || softDef;

    if (def) {
        def.restore(saved);
    }

    delete settings._preserved[key];
    saveSettingsDebounced();
    return true;
}

/**
 * Show a brief inline restore notification next to a toggle.
 * @param {string} key The toggle key
 */
function showRestoreNote(key) {
    const $label = $(`#streamline_${key}`).closest('.checkbox_label');
    const $existing = $label.find('.streamline-restore-note');
    if ($existing.length) return; // Already showing

    const $note = $('<span class="streamline-restore-note">Restored previous value</span>');
    $label.append($note);

    // Fade out after 3 seconds
    setTimeout(() => {
        $note.fadeOut(500, () => $note.remove());
    }, 3000);
}

/**
 * Update the "managed" status labels on soft-neutralize toggles.
 */
function updateManagedLabels() {
    const settings = extension_settings[SETTINGS_KEY];

    // Show "Managed by your system prompt" on active soft-neutralize toggles
    for (const [key, def] of Object.entries(SOFT_NEUTRALIZE)) {
        const $label = $(`#streamline_${key}`).closest('.checkbox_label');
        const $managed = $label.find('.streamline-managed-label');
        const isActive = !!settings[key];

        if (isActive && $managed.length === 0) {
            $label.append(`<span class="streamline-managed-label">${def.label}</span>`);
        } else if (!isActive && $managed.length > 0) {
            $managed.remove();
        }
    }

    // Show labels on hard-neutralize toggles too
    for (const [key, def] of Object.entries(HARD_NEUTRALIZE)) {
        const $label = $(`#streamline_${key}`).closest('.checkbox_label');
        const $managed = $label.find('.streamline-managed-label');
        const isActive = !!settings[key];

        if (isActive && $managed.length === 0) {
            $label.append(`<span class="streamline-managed-label">${def.label}</span>`);
        } else if (!isActive && $managed.length > 0) {
            $managed.remove();
        }
    }
}

// =====================================================================
// Hide Class Management
// =====================================================================

/**
 * Apply all current hide states to the <body> element.
 */
function applyHideClasses() {
    const settings = extension_settings[SETTINGS_KEY];
    for (const [key, className] of Object.entries(TOGGLE_MAP)) {
        document.body.classList.toggle(className, !!settings[key]);
    }
}

// =====================================================================
// Settings Persistence
// =====================================================================

/**
 * Load settings from extensionSettings, merging with defaults.
 */
function loadSettings() {
    if (!extension_settings[SETTINGS_KEY]) {
        extension_settings[SETTINGS_KEY] = {};
    }

    // Fill in any missing defaults
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[SETTINGS_KEY][key] === undefined) {
            extension_settings[SETTINGS_KEY][key] = value;
        }
    }

    // Sync all toggle checkboxes with saved settings
    for (const key of TOGGLE_KEYS) {
        $(`#streamline_${key}`).prop('checked', extension_settings[SETTINGS_KEY][key]);
    }

    applyHideClasses();
    updateManagedLabels();
}

/**
 * Handle a toggle checkbox change.
 * When toggling ON (hiding): preserve value then neutralize.
 * When toggling OFF (unhiding): restore preserved value.
 * @param {string} key Setting key
 * @param {boolean} value New value (true = hidden)
 */
function onToggleChange(key, value) {
    extension_settings[SETTINGS_KEY][key] = value;

    if (ALL_NEUTRALIZE_KEYS.has(key)) {
        if (value) {
            // Hiding — preserve and neutralize
            preserveValue(key);
            neutralize(key);
        } else {
            // Unhiding — restore
            const restored = restoreValue(key);
            if (restored) {
                showRestoreNote(key);
            }
        }
    }

    applyHideClasses();
    updateManagedLabels();
    saveSettingsDebounced();
}

/**
 * Set all toggle checkboxes to a given value.
 * @param {boolean} value
 */
function setAllToggles(value) {
    const settings = extension_settings[SETTINGS_KEY];

    if (value) {
        // Enabling all hides — preserve all neutralizable values first
        for (const key of ALL_NEUTRALIZE_KEYS) {
            preserveValue(key);
        }
    }

    for (const key of TOGGLE_KEYS) {
        settings[key] = value;
        $(`#streamline_${key}`).prop('checked', value);
    }

    if (value) {
        // Apply all neutralizations
        for (const key of ALL_NEUTRALIZE_KEYS) {
            neutralize(key);
        }
    } else {
        // Restore all preserved values
        for (const key of ALL_NEUTRALIZE_KEYS) {
            restoreValue(key);
        }
    }

    applyHideClasses();
    updateManagedLabels();
    saveSettingsDebounced();
}

// =====================================================================
// System Prompt Shortcut
// =====================================================================

/**
 * Sync Streamline's system prompt textarea with ST's main prompt quick-edit.
 */
function initSystemPromptShortcut() {
    const $streamlinePrompt = $('#streamline_system_prompt');
    const sourceSelector = '#main_prompt_quick_edit_textarea';

    function syncFromST() {
        const $source = $(sourceSelector);
        if ($source.length) {
            $streamlinePrompt.val($source.val());
        }
    }

    $streamlinePrompt.on('input', function () {
        const $source = $(sourceSelector);
        if ($source.length) {
            $source.val(this.value).trigger('input');
        }
    });

    $(document).on('input', sourceSelector, function () {
        $streamlinePrompt.val(this.value);
    });

    setTimeout(syncFromST, 1000);

    $(document).on('click', '#streamline_settings .inline-drawer-toggle', function () {
        setTimeout(syncFromST, 200);
    });
}

// =====================================================================
// Simplified Controls — Temperature (Creativity)
// =====================================================================

function readSTTemperature() {
    const $slider = $('#temp_openai');
    if ($slider.length) {
        return parseFloat($slider.val()) || 1.0;
    }
    return 1.0;
}

function writeSTTemperature(value) {
    const $slider = $('#temp_openai');
    const $counter = $('#temp_counter_openai');
    if ($slider.length) {
        $slider.val(value).trigger('input');
    }
    if ($counter.length) {
        $counter.val(value).trigger('input');
    }
}

function updateCreativityHighlight(value) {
    const valStr = String(value);
    $('#streamline_creativity_presets .streamline-preset-btn').each(function () {
        const btnVal = $(this).data('value').toString();
        $(this).toggleClass('active', btnVal === valStr);
    });
}

function syncCreativityFromST() {
    const temp = readSTTemperature();
    $('#streamline_temp_slider').val(temp);
    $('#streamline_temp_value').val(temp);
    updateCreativityHighlight(temp);
}

function initCreativityControls() {
    $('#streamline_creativity_presets').on('click', '.streamline-preset-btn', function () {
        const value = parseFloat($(this).data('value'));
        writeSTTemperature(value);
        $('#streamline_temp_slider').val(value);
        $('#streamline_temp_value').val(value);
        updateCreativityHighlight(value);
    });

    $('#streamline_temp_slider').on('input', function () {
        const value = parseFloat(this.value);
        writeSTTemperature(value);
        $('#streamline_temp_value').val(value);
        updateCreativityHighlight(value);
    });

    $('#streamline_temp_value').on('input', function () {
        const value = parseFloat(this.value);
        if (!isNaN(value) && value >= 0 && value <= 2) {
            writeSTTemperature(value);
            $('#streamline_temp_slider').val(value);
            updateCreativityHighlight(value);
        }
    });

    $('#streamline_creativity_advanced_toggle').on('click', function () {
        $('#streamline_creativity_advanced').toggle();
    });

    $(document).on('input', '#temp_openai, #temp_counter_openai', function () {
        syncCreativityFromST();
    });

    setTimeout(syncCreativityFromST, 1000);
}

// =====================================================================
// Simplified Controls — Max Response Length
// =====================================================================

function readSTMaxTokens() {
    const $input = $('#openai_max_tokens');
    if ($input.length) {
        return parseInt($input.val()) || 600;
    }
    return 600;
}

function writeSTMaxTokens(value) {
    const $input = $('#openai_max_tokens');
    if ($input.length) {
        $input.val(value).trigger('input');
    }
}

function updateResponseLengthHighlight(value) {
    const valStr = String(value);
    $('#streamline_response_length_presets .streamline-preset-btn').each(function () {
        const btnVal = $(this).data('value').toString();
        $(this).toggleClass('active', btnVal === valStr);
    });
}

function syncResponseLengthFromST() {
    const tokens = readSTMaxTokens();
    $('#streamline_max_tokens_value').val(tokens);
    updateResponseLengthHighlight(tokens);
}

function initResponseLengthControls() {
    $('#streamline_response_length_presets').on('click', '.streamline-preset-btn', function () {
        const value = parseInt($(this).data('value'));
        writeSTMaxTokens(value);
        $('#streamline_max_tokens_value').val(value);
        updateResponseLengthHighlight(value);
    });

    $('#streamline_max_tokens_value').on('input', function () {
        const value = parseInt(this.value);
        if (!isNaN(value) && value >= 1) {
            writeSTMaxTokens(value);
            updateResponseLengthHighlight(value);
        }
    });

    $('#streamline_response_length_advanced_toggle').on('click', function () {
        $('#streamline_response_length_advanced').toggle();
    });

    $(document).on('input', '#openai_max_tokens', function () {
        syncResponseLengthFromST();
    });

    setTimeout(syncResponseLengthFromST, 1000);
}

// =====================================================================
// Simplified Controls — Context Size
// =====================================================================

function readSTContextSize() {
    const $slider = $('#openai_max_context');
    if ($slider.length) {
        return parseInt($slider.val()) || 4096;
    }
    return 4096;
}

function writeSTContextSize(value) {
    const $slider = $('#openai_max_context');
    const $counter = $('#openai_max_context_counter');
    if ($slider.length) {
        const $unlock = $('#oai_max_context_unlocked');
        if ($unlock.length && !$unlock.prop('checked') && value > 4095) {
            $unlock.prop('checked', true).trigger('change');
        }
        $slider.attr('max', Math.max(value, parseInt($slider.attr('max')) || 4095));
        $slider.val(value).trigger('input');
    }
    if ($counter.length) {
        $counter.val(value).trigger('input');
    }
}

function updateContextDisplay() {
    const size = readSTContextSize();
    const displayText = size >= 1000 ? `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)}k` : String(size);
    $('#streamline_context_display').text(displayText);
    $('#streamline_context_value').val(size);
}

function initContextControls() {
    $('#streamline_context_auto').on('click', function () {
        updateContextDisplay();
    });

    $('#streamline_context_apply').on('click', function () {
        const value = parseInt($('#streamline_context_value').val());
        if (!isNaN(value) && value >= 512) {
            writeSTContextSize(value);
            updateContextDisplay();
        }
    });

    $('#streamline_context_advanced_toggle').on('click', function () {
        $('#streamline_context_advanced').toggle();
    });

    $(document).on('input', '#openai_max_context, #openai_max_context_counter', function () {
        updateContextDisplay();
    });

    setTimeout(updateContextDisplay, 1000);
}

// =====================================================================
// Self-Managed Defaults — Streaming
// =====================================================================

function ensureStreamingDefault() {
    const settings = extension_settings[SETTINGS_KEY];

    if (settings._streamingDefaultApplied) {
        return;
    }

    const $streamToggle = $('#stream_toggle');
    if ($streamToggle.length && !$streamToggle.prop('checked')) {
        $streamToggle.prop('checked', true).trigger('input');
    }

    settings._streamingDefaultApplied = true;
    saveSettingsDebounced();
}

// =====================================================================
// Initialization
// =====================================================================

jQuery(async function () {
    // Render and inject settings panel
    const settingsHtml = await renderExtensionTemplateAsync(
        'third-party/Streamline',
        'settings',
    );
    $('#extensions_settings2').append(settingsHtml);

    // Bind all toggle checkboxes
    for (const key of TOGGLE_KEYS) {
        $(`#streamline_${key}`).on('change', function () {
            onToggleChange(key, !!this.checked);
        });
    }

    // Quick action: Apply Narrative Defaults
    // — Enable all hides
    // — Hard-neutralize all hard targets
    // — Soft-neutralize all soft targets
    // — Soft-disable bloat PM fields
    // — Enable streaming
    $('#streamline_apply_narrative_defaults').on('click', () => {
        setAllToggles(true);

        // Soft-disable prompt manager fields
        // (delay slightly to ensure prompt manager is ready)
        setTimeout(() => {
            disablePMFields();
        }, 500);

        // Ensure streaming is on
        const $streamToggle = $('#stream_toggle');
        if ($streamToggle.length && !$streamToggle.prop('checked')) {
            $streamToggle.prop('checked', true).trigger('input');
        }
    });

    // Quick action: Reset All
    // — Disable all hides
    // — Restore all preserved values
    // — Restore PM field toggle states
    // — Unhide everything
    $('#streamline_reset_all').on('click', () => {
        setAllToggles(false);

        // Restore prompt manager fields
        restorePMFields();
    });

    // Load saved settings and apply hide classes
    loadSettings();

    // Re-apply neutralizations for settings that are still hidden
    // (in case ST re-loaded and reset the underlying values)
    setTimeout(() => {
        const settings = extension_settings[SETTINGS_KEY];
        for (const key of ALL_NEUTRALIZE_KEYS) {
            if (settings[key]) {
                neutralize(key);
            }
        }

        // Re-apply PM field disabling if it was active
        if (settings._pmFieldsDisabled) {
            const newStates = {};
            for (const id of PM_FIELDS_TO_DISABLE) {
                newStates[id] = false;
            }
            setPMFieldStates(newStates);
        }
    }, 2000);

    // Initialize Phase 2 features
    initSystemPromptShortcut();
    initCreativityControls();
    initResponseLengthControls();
    initContextControls();

    // Apply streaming default on first use
    setTimeout(ensureStreamingDefault, 2000);

    console.log('[Streamline] Extension loaded (Phase 2.5).');
});

export { MODULE_NAME };
