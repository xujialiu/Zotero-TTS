// Verbatim from Zotero 10.0.3's reader bundle, resource/reader/reader.js
// (omni.ja; zotero/reader, AGPL-3.0, Copyright © Corporation for Digital
// Scholarship). The reference test/core/engine/*.test.ts compare the
// Engine's copies against, bit for bit (ADR 0006). Lines 39747-39894: the
// time-stretch and word-onset modules; lines 39942-39963: the
// _initAudioContext method of RemoteReadAloudControllerBase, inside a class
// of the tests' own so it can be called. Nothing below the markers is edited.

// ---- reader.js 39747-39894 ----
;// ./src/common/read-aloud/remote/lib/time-stretch.ts
/**
 * WSOLA (Waveform Similarity Overlap-Add) time-stretching.
 *
 * Changes playback speed while preserving pitch by overlapping
 * windowed segments of the input, searching for the best alignment
 * within a tolerance window to minimize discontinuities.
 */
function stretchAudioBuffer(buffer, rate, context) {
  if (Math.abs(rate - 1) < 0.001) return buffer;
  let sampleRate = buffer.sampleRate;
  let numChannels = buffer.numberOfChannels;
  let inputLength = buffer.length;
  let outputLength = Math.round(inputLength / rate);

  // ~23ms window at 44.1kHz, power-of-2 for efficiency
  let windowSize = 1 << Math.round(Math.log2(sampleRate * 0.025));
  let synthesisHop = windowSize >> 1;
  let analysisHop = Math.round(synthesisHop * rate);
  let seekWindow = windowSize >> 2;
  let output = context.createBuffer(numChannels, outputLength, sampleRate);

  // Pre-compute Hann window
  let win = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
  }

  // Decimation factor for cross-correlation (4x faster, negligible quality loss)
  let corrDecimation = 4;
  let corrLength = Math.min(synthesisHop, windowSize);
  for (let ch = 0; ch < numChannels; ch++) {
    let inp = buffer.getChannelData(ch);
    let out = output.getChannelData(ch);

    // naturalPos tracks the ideal read position and always advances
    // by exactly analysisHop, so the search offset stays local to each
    // frame and can't accumulate across frames.
    let naturalPos = 0;
    let synthesisPos = 0;
    while (synthesisPos + windowSize <= outputLength && naturalPos + windowSize <= inputLength) {
      let bestPos = naturalPos;

      // After the first frame, search for the input position whose
      // overlap region best correlates with the existing output tail
      if (synthesisPos > 0) {
        let searchStart = Math.max(0, naturalPos - seekWindow);
        let searchEnd = Math.min(inputLength - windowSize, naturalPos + seekWindow);
        let bestCorr = -Infinity;
        for (let pos = searchStart; pos <= searchEnd; pos++) {
          let corr = 0;
          for (let i = 0; i < corrLength; i += corrDecimation) {
            corr += inp[pos + i] * out[synthesisPos + i];
          }
          if (corr > bestCorr) {
            bestCorr = corr;
            bestPos = pos;
          }
        }
      }

      // Overlap-add with Hann window
      for (let i = 0; i < windowSize; i++) {
        let outIdx = synthesisPos + i;
        let inIdx = bestPos + i;
        if (outIdx >= outputLength || inIdx >= inputLength) break;
        out[outIdx] += inp[inIdx] * win[i];
      }
      naturalPos += analysisHop;
      synthesisPos += synthesisHop;
    }
  }
  return output;
}
;// ./src/common/read-aloud/remote/lib/word-onset.ts
/**
 * Search backward from {@link position} for inter-word silences in the
 * audio, skipping back {@link wordBoundaries} word boundaries, and return
 * the onset of the next word (where energy rises again).
 * Falls back to the original position when no clear boundary is found.
 */
function findWordOnset(buffer, position, wordBoundaries = 1) {
  let sampleRate = buffer.sampleRate;
  let data = buffer.getChannelData(0);
  let posSample = Math.round(position * sampleRate);
  let windowLen = Math.round(sampleRate * 0.005); // 5ms energy windows
  let lookbackSamples = Math.round(sampleRate * 1.5 * wordBoundaries);
  let searchStart = Math.max(0, posSample - lookbackSamples);
  let numWindows = Math.floor((posSample - searchStart) / windowLen);
  if (numWindows < 3) return position;

  // Compute RMS energy per window
  let energies = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    let start = searchStart + w * windowLen;
    let sum = 0;
    for (let i = 0; i < windowLen; i++) {
      let s = data[start + i] ?? 0;
      sum += s * s;
    }
    energies[w] = Math.sqrt(sum / windowLen);
  }

  // Use the 75th percentile of RMS as the reference — represents the
  // energy level of voiced speech, robust to silent stretches
  let sorted = Array.from(energies).sort((a, b) => a - b);
  let refRms = sorted[Math.floor(sorted.length * 0.75)];
  if (refRms === 0) return position;
  let threshold = refRms * 0.1;
  // Require at least 80ms of silence — long enough to rule out
  // intra-word consonant closures (typically 10-40ms)
  let minSilenceWindows = Math.round(0.08 / 0.005); // 16 windows

  // Search backward for runs of consecutive silent windows
  let boundariesFound = 0;
  let lastOnsetWindow = -1;
  let silenceEnd = -1;
  let silenceStart = -1;
  for (let w = numWindows - 1; w >= 0; w--) {
    if (energies[w] < threshold) {
      if (silenceEnd < 0) silenceEnd = w;
      silenceStart = w;
      if (silenceEnd - silenceStart + 1 >= minSilenceWindows) {
        boundariesFound++;
        // Find the word onset after this silence gap
        for (let ow = silenceEnd + 1; ow < numWindows; ow++) {
          if (energies[ow] >= threshold) {
            lastOnsetWindow = ow;
            break;
          }
        }
        if (boundariesFound >= wordBoundaries) {
          break;
        }
        // Continue searching backward from before this silence
        silenceEnd = -1;
        silenceStart = -1;
      }
    } else {
      silenceEnd = -1;
      silenceStart = -1;
    }
  }
  if (lastOnsetWindow >= 0) {
    return (searchStart + lastOnsetWindow * windowLen) / sampleRate;
  }
  return position;
}
// ---- reader.js 39942-39963, inside a test class ----
class InitAudioContextHost {
  _initAudioContext() {
    // Build audio processing chain for speech clarity
    this._audioContext = new AudioContext();

    // Cut rumble and low-frequency noise below 80Hz
    let highpass = this._audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 0.7;

    // Gently peak around 3kHz to make speech clearer
    let presence = this._audioContext.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3000;
    presence.gain.value = 3;
    presence.Q.value = 1;

    // Normalize volume across voices
    let compressor = this._audioContext.createDynamicsCompressor();
    highpass.connect(presence).connect(compressor).connect(this._audioContext.destination);
    this._filterChainInput = highpass;
  }
}
