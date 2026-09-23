// Verbatim from Zotero 10.0.3's reader bundle, resource/reader/reader.js
// (omni.ja; zotero/reader, AGPL-3.0, Copyright © Corporation for Digital
// Scholarship): Read Aloud's manager, the remote voice and provider it
// builds, and the language helpers they use. test/read-aloud/engine/
// runs the Engine's hooks against this very code. The test supplies
// what these modules import from elsewhere in the bundle:
// RemoteReadAloudController, RemoteSampleReadAloudController,
// BrowserReadAloudProvider and navigator. Nothing below the markers is
// edited.

// ---- reader.js 37975-38099 ----
;// ./src/common/read-aloud/lang.ts
// Equivalents for nonstandard language codes
const LANGUAGE_EQUIVALENTS = {
  cmn: 'zh' // Chinese
};

// And region codes
const REGION_EQUIVALENTS = {
  // Arabic
  XA: '001',
  SA: '001',
  // Chinese (local voices)
  CN: '',
  HK: '',
  TW: ''
};

// Default regions for languages with multiple regional variants,
// used when there's no better match (e.g., based on system locale)
const DEFAULT_REGIONS = {
  zh: 'CN',
  nl: 'NL',
  en: 'US',
  fr: 'FR',
  pt: 'BR',
  es: 'ES'
};
function getBaseLanguage(lang) {
  return lang.replace(/-.+$/g, '');
}
function normalizeLanguage(lang) {
  let base = getBaseLanguage(lang);
  let region = lang.includes('-') ? lang.substring(base.length + 1) : '';
  let normalizedBase = LANGUAGE_EQUIVALENTS[base] ?? base;
  let normalizedRegion = REGION_EQUIVALENTS[region] ?? region;
  return normalizedRegion ? `${normalizedBase}-${normalizedRegion}` : normalizedBase;
}
function isLanguageSupported(voiceLang, lang) {
  // Wildcard for non-Zotero TTS APIs that are language-agnostic,
  // e.g. OpenAI
  if (voiceLang === '*' || lang === '*') {
    return true;
  }
  let normalizedLang = normalizeLanguage(lang);
  let baseLang = getBaseLanguage(normalizedLang);
  let hasRegion = normalizedLang.includes('-');
  let normalizedVoiceLang = normalizeLanguage(voiceLang);
  let voiceBaseLang = getBaseLanguage(normalizedVoiceLang);
  let voiceHasRegion = normalizedVoiceLang.includes('-');

  // Base languages must match
  if (voiceBaseLang !== baseLang) {
    return false;
  }

  // If no region specified, accept any variant
  if (!hasRegion) {
    return true;
  }

  // If region specified, accept voices with matching region or no region
  if (!voiceHasRegion || normalizedVoiceLang === normalizedLang) {
    return true;
  }
  return false;
}
function getPreferredRegion(baseLang) {
  let normalizedBase = LANGUAGE_EQUIVALENTS[baseLang] ?? baseLang;
  for (let userLang of navigator.languages) {
    let normalized = normalizeLanguage(userLang);
    if (normalized.startsWith(normalizedBase + '-')) {
      return normalized.substring(normalizedBase.length + 1);
    }
  }
  return DEFAULT_REGIONS[normalizedBase] ?? null;
}

/**
 * Find the best match for a language code in a list of language codes.
 * Tries exact match, then exact regional match, then preferred region,
 * then falls back to first candidate with the same base language.
 */
function resolveLanguage(lang, langs) {
  if (!langs.length) {
    return null;
  }

  // Already in the list
  if (langs.includes(lang)) {
    return lang;
  }
  let normalizedLang = normalizeLanguage(lang);
  let baseLang = getBaseLanguage(normalizedLang);

  // Find candidates with the same base language
  let candidates = langs.filter(candidate => {
    candidate = normalizeLanguage(candidate);
    let candidateBase = getBaseLanguage(candidate);
    return candidateBase === baseLang;
  });
  if (!candidates.length) {
    return null;
  }

  // If normalizedLang has a region, prefer exact regional match
  if (normalizedLang.includes('-')) {
    let exactMatch = candidates.find(c => normalizeLanguage(c) === normalizedLang);
    if (exactMatch) {
      return exactMatch;
    }
  }

  // Use preferred region to pick the best match
  let preferredRegion = getPreferredRegion(baseLang);
  if (preferredRegion) {
    let regionMatch = candidates.find(c => {
      let normalized = normalizeLanguage(c);
      return normalized === `${baseLang}-${preferredRegion}`;
    });
    if (regionMatch) {
      return regionMatch;
    }
  }
  return candidates[0];
}
// ---- reader.js 39247-39295 ----
;// ./src/common/read-aloud/voice.ts

class ReadAloudVoice {
  impl;
  provider;
  constructor(provider, impl) {
    this.provider = provider;
    this.impl = impl;
  }
  get minutesRemaining() {
    let creditsRemaining = this.tier === 'standard' ? this.provider.standardCreditsRemaining : this.tier === 'premium' ? this.provider.premiumCreditsRemaining : null;
    let creditsPerMinute = this.creditsPerMinute;
    if (creditsRemaining === null || !creditsPerMinute) {
      return null;
    }
    return creditsRemaining / creditsPerMinute;
  }
}
const TIERS = ['standard', 'premium', 'local'];
function resolveEnabledVoiceIDs(tierVoices, persistedVoiceIDs) {
  if (Array.isArray(persistedVoiceIDs)) {
    return persistedVoiceIDs;
  }
  return tierVoices.filter(v => v.default).map(v => v.id);
}
function getSupportedLanguages(voices) {
  let langs = new Set();
  for (let voice of voices) {
    // Wildcard voices match any language and shouldn't appear as
    // a selectable language option
    if (voice.language === '*') {
      continue;
    }
    let normalized = normalizeLanguage(voice.language);
    langs.add(normalized);
  }
  return [...langs];
}
function getVoicesForLanguage(voices, lang) {
  return voices.filter(voice => isLanguageSupported(voice.language, lang));
}
function getVoiceRegion(voice) {
  if (voice.language === '*') {
    return null;
  }
  let normalized = normalizeLanguage(voice.language);
  let base = getBaseLanguage(normalized);
  return normalized.includes('-') ? normalized.substring(base.length + 1) : null;
}
// ---- reader.js 40442-40554 ----
;// ./src/common/read-aloud/remote/voice.ts


class RemoteReadAloudVoice extends ReadAloudVoice {
  get id() {
    return this.impl.id;
  }
  get label() {
    return this.impl.label;
  }
  get language() {
    return this.impl.locale;
  }
  get score() {
    if (this.id === 'openai') {
      return 998;
    }
    return 999;
  }
  get segmentGranularity() {
    return this.impl.segmentGranularity;
  }
  get creditsPerMinute() {
    return this.impl.creditsPerMinute;
  }
  get tier() {
    return this.impl.tier;
  }
  get default() {
    return true;
  }
  get sentenceDelay() {
    return this.impl.sentenceDelay ?? 0;
  }
  getController(segments, backwardStopIndex, forwardStopIndex) {
    return new RemoteReadAloudController(this, segments, backwardStopIndex, forwardStopIndex);
  }
  getSampleController(segments) {
    return new RemoteSampleReadAloudController(this, segments);
  }
}
;// ./src/common/read-aloud/remote/provider.ts


class RemoteVoicesError extends Error {
  errorState;
  constructor(errorState) {
    super(`Remote voices error: ${errorState}`);
    this.errorState = errorState;
    this.name = 'RemoteVoicesError';
  }
}
class RemoteReadAloudProvider {
  remote;
  standardCreditsRemaining = null;
  premiumCreditsRemaining = null;
  devMode = false;
  constructor(remote) {
    this.remote = remote;
  }
  async getVoices() {
    let {
      error,
      voices,
      standardCreditsRemaining,
      premiumCreditsRemaining,
      devMode
    } = await this.remote.getVoices();
    if (error || !voices) {
      throw new RemoteVoicesError(error || 'unknown');
    }
    if (standardCreditsRemaining !== null) {
      this.standardCreditsRemaining = standardCreditsRemaining;
    }
    if (premiumCreditsRemaining !== null) {
      this.premiumCreditsRemaining = premiumCreditsRemaining;
    }
    this.devMode = devMode;
    return parseVoicesResponse(voices).map(voice => new RemoteReadAloudVoice(this, voice));
  }
}

/**
 * Transform a format=2 voices response into a flat RemoteVoiceConfig array.
 * Each voice+locale combination produces a separate entry.
 */
function parseVoicesResponse(response) {
  let voices = [];
  for (let [tier, configs] of Object.entries(response)) {
    if (!Array.isArray(configs) || !TIERS.includes(tier)) continue;
    for (let config of configs) {
      for (let [locale, localeConfig] of Object.entries(config.locales || {})) {
        // Tolerate localeConfig being a plain array of IDs
        let ids = Array.isArray(localeConfig) ? localeConfig : [...localeConfig.default, ...(localeConfig.other ?? [])];
        for (let id of ids) {
          let voiceInfo = config.voices?.[id];
          if (!voiceInfo) continue;
          voices.push({
            id,
            label: voiceInfo.label,
            tier: tier,
            locale,
            creditsPerMinute: config.creditsPerMinute,
            segmentGranularity: config.segmentGranularity,
            sentenceDelay: config.sentenceDelay,
            cacheVersion: config.cacheVersion
          });
        }
      }
    }
  }
  return voices;
}
// ---- reader.js 82154-82753 ----
;// ./src/common/read-aloud/manager.ts





const URGENT_THRESHOLD_MINUTES = 3;
/**
 * Owns the Read Aloud engine lifecycle: controller creation/destruction,
 * voice resolution, credit polling, and playback state.
 * Does not know about React or the DOM.
 */
class ReadAloudManager {
  _options;

  // Engine
  _controller = null;
  _voice = null;

  // Segments
  _segments = null;
  _backwardStopIndex = null;
  _forwardStopIndex = null;

  /**
   * Transient target position for initial segment computation.
   * Set before activation, consumed by _composeReadAloudStateSnapshot,
   * then cleared.
   */
  _targetPosition = null;

  // Playback state
  _active = false;
  _paused = true;
  _speed = 1;
  _activeSegment = null;
  _activeTimestampIndex = null;
  _lastSkipGranularity = null;
  _buffering = false;
  _error = null;

  // Voice catalog
  _allVoices = [];
  _selectedTier = null;
  _lang = null;
  _region = null;
  _voiceID = null;
  _segmentGranularity = null;
  _devMode = false;
  _persistedVoices = {};
  _pendingSetVoice = false;

  // Periodic server refresh for credit balance
  _creditRefreshInterval = null;
  constructor(options) {
    this._options = options;
  }
  get active() {
    return this._active;
  }
  get paused() {
    return this._paused;
  }
  get speed() {
    return this._speed;
  }
  get activeSegment() {
    return this._activeSegment;
  }

  /**
   * Word-level timestamp for the chunk of audio currently playing within the
   * active segment, or null when the controller hasn't reached one yet (or
   * doesn't supply word-level data).
   */
  get activeTimestamp() {
    if (this._activeTimestampIndex === null || !this._activeSegment || !(this._controller instanceof RemoteReadAloudController)) {
      return null;
    }
    let timestamps = this._controller.getTimestampsForSegment(this._activeSegment);
    return timestamps?.[this._activeTimestampIndex] ?? null;
  }
  get lastSkipGranularity() {
    return this._lastSkipGranularity;
  }
  get buffering() {
    return this._buffering;
  }
  get error() {
    return this._error;
  }
  get segments() {
    return this._segments;
  }
  get minutesRemaining() {
    return this._controller?.minutesRemaining ?? null;
  }
  get isQuotaExceeded() {
    return this._controller?.error === 'quota-exceeded';
  }
  get isQuotaLow() {
    return this.isQuotaExceeded || this.minutesRemaining !== null && this.minutesRemaining < URGENT_THRESHOLD_MINUTES;
  }
  get hasStandardMinutesRemaining() {
    return this._controller?.hasStandardMinutesRemaining ?? false;
  }
  get segmentGranularity() {
    return this._segmentGranularity;
  }
  get lang() {
    return this._lang;
  }
  get region() {
    return this._region;
  }
  get selectedVoiceID() {
    return this._voiceID;
  }
  get selectedTier() {
    return this._selectedTier;
  }
  get allVoices() {
    return this._allVoices;
  }
  get devMode() {
    return this._devMode;
  }
  get voices() {
    return this._allVoices.filter(v => this._selectedTier === null || v.tier === this._selectedTier);
  }
  get languages() {
    return getSupportedLanguages(this.voices);
  }
  get currentVoiceRegion() {
    let voice = this._allVoices.find(v => v.id === this._voiceID);
    return voice ? getVoiceRegion(voice) : null;
  }
  get voicesForLanguage() {
    let region = this.currentVoiceRegion ?? this._region;
    let lang = region ? `${this._lang}-${region}` : this._lang;
    return getVoicesForLanguage(this.voices, lang ?? '');
  }
  get tiers() {
    return new Set(this._allVoices.map(v => v.tier));
  }
  get targetPosition() {
    return this._targetPosition;
  }
  setTargetPosition(position) {
    this._targetPosition = position;
  }
  consumeTargetPosition() {
    let pos = this._targetPosition ?? undefined;
    this._targetPosition = null;
    return pos;
  }
  async loadVoices(loadRemote) {
    let remoteProvider = this._options.remoteInterface ? new RemoteReadAloudProvider(this._options.remoteInterface) : null;
    let browserProvider = new BrowserReadAloudProvider();
    let handleError = e => {
      console.error(e);
      return [];
    };
    let [remoteVoices, browserVoices] = await Promise.all([loadRemote && remoteProvider ? remoteProvider.getVoices().catch(handleError) : [], browserProvider.getVoices().catch(handleError)]);
    this._allVoices = [...remoteVoices, ...browserVoices];
    this._devMode = remoteProvider?.devMode ?? false;
    this._resolveVoice();
    this._stateChanged();
  }

  /**
   * Set the language. If the language actually changed, clears the
   * current voice and re-resolves.
   */
  setLanguage(lang, {
    region = null,
    persist = false
  } = {}) {
    let base = getBaseLanguage(lang);
    if (base === this._lang && region === this._region) {
      return;
    }
    this._lang = base;
    this._region = region;
    this._voiceID = null;
    if (persist) {
      this._pendingSetVoice = true;
    }
    if (this._allVoices.length) {
      this._resolveVoice();
    }
    this._stateChanged();
  }
  selectVoice(voiceID) {
    this._voiceID = voiceID;
    this._applyVoice();
    this._persistCurrentVoice();
    this._stateChanged();
  }
  selectTier(tier) {
    this._selectedTier = tier;
    // Preserve the current region so the fallback logic tries to
    // match it in the new tier
    this._region = this.currentVoiceRegion ?? this._region;
    // Restore persisted voice for this tier, if any
    this._voiceID = this._persistedVoices.tierVoices?.[tier] ?? null;
    this._pendingSetVoice = true;
    this._resolveVoice();
    this._stateChanged();
  }
  applyPersistedVoices(persisted) {
    this._persistedVoices = persisted;
    // Clear current voice and tier so _resolveVoice re-evaluates
    // from scratch using the new persisted preferences
    this._voiceID = null;
    this._selectedTier = null;
    this._resolveVoice();
    this._stateChanged();
  }
  setSpeed(speed, persist = false) {
    this._speed = speed;
    if (this._controller && this._controller.speed !== speed) {
      this._controller.speed = speed;
    }
    if (persist) {
      this._persistCurrentVoice();
    }
    this._stateChanged();
  }

  /**
   * Persist the current voice preferences via the onSetVoice callback.
   */
  _persistCurrentVoice() {
    if (!this._voiceID) return;
    let voice = this._allVoices.find(v => v.id === this._voiceID);
    let tier = this._selectedTier || voice?.tier || null;
    let region = voice ? getVoiceRegion(voice) : null;
    this._options.onSetVoice({
      lang: getBaseLanguage(this._lang ?? ''),
      region,
      voice: this._voiceID,
      speed: this._speed,
      tier
    });
  }

  /**
   * Resolve the best voice for the current language/tier/persisted preferences.
   * Mirrors the fallback logic formerly in ReadAloudPopup's fallbackVoiceID useMemo
   * and voice selection useEffect.
   */
  _resolveVoice() {
    // If no language yet, wait for the view to report one
    if (!this._lang) {
      return;
    }

    // Cache tier-filtered voices to avoid redundant getter evaluations
    let tierVoices = this.voices;
    let languages = getSupportedLanguages(tierVoices);

    // Compute candidate voices from the base language, not from
    // currentVoiceRegion - voice could've been set before lang changed
    let lang = this._region ? `${this._lang}-${this._region}` : this._lang;
    let voicesForLang = getVoicesForLanguage(tierVoices, lang);

    // Reset language if it's no longer available
    let baseLang = getBaseLanguage(this._lang);
    if (languages.length && !languages.some(l => getBaseLanguage(l) === baseLang)) {
      let resolved = resolveLanguage(this._lang, languages) || languages[0];
      this._lang = getBaseLanguage(resolved);
      this._region = null;
      this._voiceID = null;
      lang = this._lang;
      voicesForLang = getVoicesForLanguage(tierVoices, lang);
    }

    // Fall back to local when selected tier becomes unavailable
    let tiers = this.tiers;
    if (this._selectedTier !== null && !tiers.has(this._selectedTier) && tiers.has('local')) {
      this._selectedTier = 'local';
    }

    // If current voice is still valid, keep it
    let voiceResolved = false;
    if (this._voiceID && voicesForLang.some(v => v.id === this._voiceID)) {
      this._applyVoice();
      voiceResolved = true;
    }
    // Otherwise, find a fallback
    else if (voicesForLang.length) {
      let voiceID = this._findFallbackVoice(voicesForLang) ?? voicesForLang[0].id;
      if (voiceID !== this._voiceID) {
        this._voiceID = voiceID;
        this._applyVoice();
      }
      voiceResolved = true;
    }

    // Persist if this change was initiated by the user
    if (voiceResolved && this._pendingSetVoice) {
      this._pendingSetVoice = false;
      this._persistCurrentVoice();
    }
  }
  _findFallbackVoice(voicesForLang) {
    let {
      voice: persistedVoice,
      region: persistedRegion,
      tierVoices: persistedTierVoices
    } = this._persistedVoices;
    let targetTier = this._selectedTier;
    if (!targetTier && persistedTierVoices) {
      let persistedTier = Object.keys(persistedTierVoices).pop();
      if (persistedTier) {
        targetTier = persistedTier;
      }
    }

    // Stay within targetTier unless it has no voices for this language
    let pool = targetTier ? voicesForLang.filter(v => v.tier === targetTier) : voicesForLang;
    if (!pool.length) {
      pool = voicesForLang;
    }
    let isAvailable = id => id && pool.some(v => v.id === id);

    // Skip persisted voice when user explicitly selected a different region
    let regionChanged = this._region && persistedRegion && this._region !== persistedRegion;

    // 1. Tier-specific voice for this language
    if (!regionChanged && isAvailable(persistedTierVoices?.[targetTier])) {
      return persistedTierVoices[targetTier];
    }
    // 2. Last-used voice for this language
    if (!regionChanged && isAvailable(persistedVoice)) {
      return persistedVoice;
    }
    // 3. First voice matching the selected, persisted, or preferred region
    let region = this._region || persistedRegion || getPreferredRegion(this._lang ?? '');
    if (region) {
      let regionMatch = pool.find(v => getVoiceRegion(v) === region);
      if (regionMatch) {
        return regionMatch.id;
      }
    }
    return null;
  }

  /**
   * Apply the current _voiceID: find the voice object, update segment granularity,
   * and recreate the controller if segments exist.
   */
  _applyVoice() {
    let voice = this._allVoices.find(v => v.id === this._voiceID);
    if (!voice || !this.voicesForLanguage.some(v => v.id === this._voiceID)) {
      this._voice = null;
      this._destroyController();
      return;
    }

    // Always update the voice fields so activate() can use them
    let granularityChanged = voice.segmentGranularity !== this._segmentGranularity;
    this._voice = voice;
    this._segmentGranularity = voice.segmentGranularity;
    this._selectedTier = voice.tier;

    // Only request segments / create controller when active.
    // When not active, the caller (activate/play) will do this
    // after setting _active.
    if (!this._active) {
      return;
    }
    if (!this._segments || granularityChanged) {
      // Request (re)computation of segments from the view
      this._segments = null;
      this._options.onRequestSegments();
    } else {
      // Same granularity, segments exist: recreate controller with new voice
      this._createController();
    }
  }
  clearSegments() {
    this._segments = null;
    this._backwardStopIndex = null;
    this._forwardStopIndex = null;
    this._activeSegment = null;
    this._destroyController();
  }
  setSegments(segments, backwardStopIndex, forwardStopIndex) {
    this._segments = segments;
    this._backwardStopIndex = backwardStopIndex;
    this._forwardStopIndex = forwardStopIndex;
    this._createController();
    this._stateChanged();
  }
  activate() {
    if (!this._voice) return;
    this._active = true;
    this._paused = false;
    this._segmentGranularity = this._voice.segmentGranularity;
    this._options.onRequestSegments();
    this._stateChanged();
  }
  play() {
    if (!this._active) {
      this.activate();
      return;
    }
    this._paused = false;
    if (this._controller) {
      this._controller.paused = false;
    }
    this._stateChanged();
  }
  pause() {
    this._paused = true;
    if (this._controller) {
      this._controller.paused = true;
    }
    this._stateChanged();
  }
  togglePaused() {
    if (this._paused) {
      this.play();
    } else {
      this.pause();
    }
  }
  skipBack(granularity = 'paragraph', accelerate = false) {
    this._controller?.skipBack(granularity, accelerate);
  }
  skipAhead(granularity = 'paragraph', accelerate = false) {
    this._controller?.skipAhead(granularity, accelerate);
  }
  syncActiveWordToPlayback() {
    this._controller?.syncActiveWordToPlayback();
  }
  getSegmentToAnnotate() {
    return this._controller?.getSegmentToAnnotate() ?? null;
  }
  retry() {
    if (this._controller?.retry) {
      this._paused = false;
      this._controller.retry();
      this._stateChanged();
    }
  }

  /**
   * Jump to a position within existing segments.
   * No-op if not active or segments haven't been computed yet.
   */
  jumpTo(position) {
    if (!this._segments || !this._active) {
      return;
    }
    let index = this._options.onComputeRepositionIndex(position);
    if (index !== null) {
      this.repositionTo(index);
    }
  }

  /**
   * Reposition the controller to a new segment index without full
   * segment recomputation.
   */
  repositionTo(backwardStopIndex) {
    this._backwardStopIndex = backwardStopIndex;
    this._forwardStopIndex = null;
    this._paused = false;
    this._activeSegment = null;
    this._createController();
    this._stateChanged();
  }
  async refreshCreditsRemaining() {
    if (this._controller) {
      await this._controller.refreshCreditsRemaining();
      this._stateChanged();
    }
  }
  async resetCredits() {
    if (this._controller) {
      await this._controller.resetCredits();
      this._stateChanged();
    }
  }
  _startCreditRefresh() {
    this._stopCreditRefresh();
    this._creditRefreshInterval = setInterval(() => {
      this.refreshCreditsRemaining();
    }, 60_000);
  }
  _stopCreditRefresh() {
    if (this._creditRefreshInterval !== null) {
      clearInterval(this._creditRefreshInterval);
      this._creditRefreshInterval = null;
    }
  }
  _createController() {
    this._destroyController();
    if (!this._voice || !this._segments) {
      return;
    }

    // If the active segment is still in the segment list, start from it
    let backwardStopIndex = this._backwardStopIndex;
    if (this._segments && this._activeSegment && this._segments.includes(this._activeSegment)) {
      backwardStopIndex = this._segments.indexOf(this._activeSegment);
    }
    let controller = this._voice.getController(this._segments, backwardStopIndex, this._forwardStopIndex);
    this._controller = controller;
    this._error = null;
    this._buffering = controller.buffering;

    // Sync speed
    if (controller.speed !== this._speed) {
      controller.speed = this._speed;
    }

    // Wire up event listeners
    controller.addEventListener('BufferingChange', () => {
      this._buffering = controller.buffering;
      this._stateChanged();
    });
    controller.addEventListener('ActiveSegmentChanging', event => {
      this._activeSegment = event.segment;
      this._activeTimestampIndex = null;
      this._lastSkipGranularity = controller.lastSkipGranularity;
      this._stateChanged();
    });
    controller.addEventListener('ActiveSegmentChange', event => {
      this._activeSegment = event.segment;
      this._activeTimestampIndex = null;
      this._lastSkipGranularity = controller.lastSkipGranularity;
      this._stateChanged();
    });
    controller.addEventListener('ActiveWordChange', () => {
      let newIndex = controller.activeTimestampIndex;
      if (this._activeTimestampIndex === newIndex) return;
      this._activeTimestampIndex = newIndex;
      this._stateChanged();
    });
    controller.addEventListener('Complete', () => {
      this._paused = true;
      this._activeSegment = null;
      this._activeTimestampIndex = null;
      this._stateChanged();
    });
    controller.addEventListener('Error', () => {
      this._paused = true;
      this._error = controller.error;
      this._stateChanged();
    });
    controller.addEventListener('ErrorCleared', () => {
      this._error = null;
      this._stateChanged();
    });

    // Start credit polling
    this._startCreditRefresh();

    // Sync paused state
    controller.paused = this._paused;
  }
  _destroyController() {
    if (this._controller) {
      this._controller.destroy();
      this._controller = null;
      this._buffering = false;
    }
    this._stopCreditRefresh();
    this._activeTimestampIndex = null;
  }
  deactivate() {
    this._active = false;
    this._paused = true;
    this._segments = null;
    this._backwardStopIndex = null;
    this._forwardStopIndex = null;
    this._activeSegment = null;
    this._lastSkipGranularity = null;
    this._error = null;
    this._destroyController();
    this._stateChanged();
  }
  _stateChangePending = false;
  _stateChanged() {
    if (!this._stateChangePending) {
      this._stateChangePending = true;
      queueMicrotask(() => {
        this._stateChangePending = false;
        this._options.onStateChange();
      });
    }
  }
  destroy() {
    this._destroyController();
  }
}
