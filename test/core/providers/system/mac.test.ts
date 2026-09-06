import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../../../src/core/providers/errors';
import {
  createMacBackend,
  MAC_OSASCRIPT,
  MAC_SAY,
  MAC_VOICES_SCRIPT,
  macSayArguments,
  macVoicesArguments,
  parseMacVoices,
  type MacExit,
  type MacProcess,
} from '../../../../src/core/providers/system/mac';

/**
 * Three of the 191 voices this Mac reports through
 * `NSSpeechSynthesizer.availableVoices` (macOS 26.6.2, 2026-09-06), as the
 * JXA script prints them: the identifier, the display name (which is not
 * always the identifier's last word — Alpana is shown as Soumya), the
 * BCP-47 `VoiceLanguage` and the `VoiceLocaleIdentifier`. The Arabic voice
 * is the one whose region is the UN "World" code, 001.
 */
const LISTING =
  JSON.stringify([
    { id: 'com.apple.speech.synthesis.voice.Albert', name: 'Albert', language: 'en-US', locale: 'en_US' },
    { id: 'com.apple.voice.compact.kn-IN.Alpana', name: 'Soumya', language: 'kn-IN', locale: 'kn_IN' },
    { id: 'com.apple.voice.compact.ar-001.Maged', name: 'Majed', language: 'ar-001', locale: 'ar_001' },
  ]) + '\n';

const ALBERT = 'osx/com.apple.speech.synthesis.voice.Albert';
const TEXT = 'Read Aloud gives Zotero a voice, and this plugin gives it more.';

type Answer = Partial<MacExit> | 'hang' | Error;

/**
 * The spawner replaced by a table of answers. A process that "hangs" never
 * settles until it is killed, which then ends it the way SIGTERM ends a
 * real one: an exit code of -15.
 */
function fakeRunner(answer: (command: string, args: string[]) => Answer) {
  const calls: { command: string; args: string[] }[] = [];
  let killed = 0;
  const run = vi.fn(async (command: string, args: string[]): Promise<MacProcess> => {
    calls.push({ command, args });
    const a = answer(command, args);
    if (a instanceof Error) throw a;
    if (a === 'hang') {
      let end!: (exit: MacExit) => void;
      const output = new Promise<MacExit>((resolve) => {
        end = resolve;
      });
      return {
        output,
        kill: () => {
          killed += 1;
          end({ exitCode: -15, stdout: '', stderr: '' });
        },
      };
    }
    return {
      output: Promise.resolve({ exitCode: 0, stdout: '', stderr: '', ...a }),
      kill: () => {
        killed += 1;
      },
    };
  });
  return { run, calls, killed: () => killed };
}

const listing = (command: string): Answer => (command === MAC_OSASCRIPT ? { stdout: LISTING } : {});

function setup(answer: (command: string, args: string[]) => Answer = listing, timeoutMs = 5000) {
  const runner = fakeRunner(answer);
  const debug = vi.fn((_m: string) => {});
  const backend = createMacBackend({ run: runner.run, timeoutMs, debug });
  return { ...runner, debug, backend };
}

describe('the command lines', () => {
  it('lists through osascript running the JXA script inline, so nothing is written to disk', () => {
    expect(macVoicesArguments()).toEqual(['-l', 'JavaScript', '-e', MAC_VOICES_SCRIPT]);
    expect(MAC_VOICES_SCRIPT).toContain('availableVoices');
    expect(MAC_VOICES_SCRIPT).toContain('attributesForVoice');
    // Plain ASCII: the script travels as an argument, and stays readable in a log
    expect(MAC_VOICES_SCRIPT).toMatch(/^[\x09\x0a\x20-\x7e]*$/);
  });

  it('asks say for 16-bit 22050 Hz WAVE into the file, with the text after -- so a leading dash is not a flag', () => {
    expect(macSayArguments('com.apple.voice.compact.en-US.Samantha', '/tmp/zotero-tts-abc-1.wav', '-v is not a flag here')).toEqual([
      '-v',
      'com.apple.voice.compact.en-US.Samantha',
      '--file-format=WAVE',
      '--data-format=LEI16@22050',
      '-o',
      '/tmp/zotero-tts-abc-1.wav',
      '--',
      '-v is not a flag here',
    ]);
  });
});

describe('parseMacVoices', () => {
  it('turns the JXA listing into osx/ records with the display name and the BCP-47 tag', () => {
    expect(parseMacVoices(LISTING)).toEqual([
      { id: ALBERT, name: 'Albert', desc: 'Albert', lang: 'en-US' },
      { id: 'osx/com.apple.voice.compact.kn-IN.Alpana', name: 'Soumya', desc: 'Soumya', lang: 'kn-IN' },
      { id: 'osx/com.apple.voice.compact.ar-001.Maged', name: 'Majed', desc: 'Majed', lang: 'ar-001' },
    ]);
  });

  it('falls back to the locale identifier, as a tag, when a voice reports no language', () => {
    const one = parseMacVoices(JSON.stringify([{ id: 'com.apple.x', name: 'X', locale: 'de_DE' }]));
    expect(one[0].lang).toBe('de-DE');
    const none = parseMacVoices(JSON.stringify([{ id: 'com.apple.y', name: 'Y' }]));
    expect(none[0].lang).toBe('');
  });

  it('drops entries that are not voices rather than publishing them half-formed', () => {
    const raw = JSON.stringify([{ id: 'com.apple.x', name: 'X', language: 'en-US' }, { name: 'no id' }, null, 'nonsense', { id: 7 }]);
    expect(parseMacVoices(raw).map((r) => r.id)).toEqual(['osx/com.apple.x']);
  });

  it('refuses output that is not a JSON array, naming osascript', () => {
    expect(() => parseMacVoices('execution error: something (-2700)')).toThrow(/osascript/);
    expect(() => parseMacVoices('{"voices": []}')).toThrow(/osascript/);
    expect(() => parseMacVoices('')).toThrow(/osascript/);
  });
});

describe('createMacBackend', () => {
  it('is the macOS backend: no word marks, so the provider highlights by sentence', () => {
    const t = setup();
    expect(t.backend.platform).toBe('mac');
    expect(t.backend.wordTimestamps).toBe(false);
  });

  it('answers a ping without spawning anything', async () => {
    const t = setup();
    await expect(t.backend.send({ op: 'ping' })).resolves.toMatchObject({ ok: true });
    expect(t.run).not.toHaveBeenCalled();
  });

  it('lists the voices through osascript and remembers how many it saw', async () => {
    const t = setup();
    const response = await t.backend.send({ op: 'voices' });
    expect(t.calls).toEqual([{ command: MAC_OSASCRIPT, args: macVoicesArguments() }]);
    expect(response.ok).toBe(true);
    expect(response.voices?.map((v) => v.id)).toEqual([ALBERT, 'osx/com.apple.voice.compact.kn-IN.Alpana', 'osx/com.apple.voice.compact.ar-001.Maged']);
    expect(t.backend.state()).toMatchObject({ running: 0, spawned: 1, voices: 3, lastError: null });
  });

  it('reports a listing that failed, with what osascript said', async () => {
    const t = setup(() => ({ exitCode: 1, stderr: 'execution error: Error: Error: boom (-2700)\n' }));
    await expect(t.backend.send({ op: 'voices' })).rejects.toThrow(/osascript exited with 1: execution error: Error: Error: boom \(-2700\)/);
    expect(t.backend.state()).toMatchObject({ lastError: expect.stringMatching(/boom/) });
  });

  it('reports a listing it cannot read, rather than publishing nothing silently', async () => {
    const t = setup(() => ({ stdout: 'not json' }));
    await expect(t.backend.send({ op: 'voices' })).rejects.toThrow(/osascript/);
  });

  it('synthesizes a listed voice through say, with exactly the command line above', async () => {
    const t = setup();
    await t.backend.send({ op: 'voices' });
    const response = await t.backend.send({ op: 'speak', voice: ALBERT, text: TEXT, file: '/tmp/zotero-tts-abc-1.wav' });
    expect(response.ok).toBe(true);
    // No marks: the provider is told nothing it could mistake for a timeline
    expect(response.words).toBeUndefined();
    expect(t.calls[1]).toEqual({ command: MAC_SAY, args: macSayArguments('com.apple.speech.synthesis.voice.Albert', '/tmp/zotero-tts-abc-1.wav', TEXT) });
    expect(t.backend.state()).toMatchObject({ running: 0, spawned: 2 });
  });

  it('lists first when a sentence arrives before any listing, since say cannot be trusted with an id', async () => {
    const t = setup();
    await t.backend.send({ op: 'speak', voice: ALBERT, text: TEXT, file: '/tmp/f.wav' });
    expect(t.calls.map((c) => c.command)).toEqual([MAC_OSASCRIPT, MAC_SAY]);
  });

  // Measured 2026-09-06, in Zotero: `say -v com.apple.voice.nosuch.Nobody`
  // exits 0, writes nothing to stderr, and produces Samantha's audio byte
  // for byte (not the system default's, which was Tom) — so an id the
  // listing does not carry must never reach say
  it('refuses an id that is not installed after one fresh listing, and spawns no say for it', async () => {
    const t = setup();
    await t.backend.send({ op: 'voices' });
    const attempt = t.backend.send({ op: 'speak', voice: 'osx/com.apple.voice.nosuch.Nobody', text: TEXT, file: '/tmp/f.wav' });
    await expect(attempt).rejects.toThrow(/macOS has no voice "com.apple.voice.nosuch.Nobody"/);
    await expect(attempt).rejects.toMatchObject({ kind: 'unknown' });
    expect(t.calls.map((c) => c.command)).toEqual([MAC_OSASCRIPT, MAC_OSASCRIPT]);
  });

  it('refuses an id that is not an osx/ id at all, without spawning anything', async () => {
    const t = setup();
    await expect(t.backend.send({ op: 'speak', voice: 'onecore/MSTTS_V110_enUS_MarkM', text: TEXT, file: '/tmp/f.wav' })).rejects.toThrow(/Not a macOS voice id/);
    expect(t.run).not.toHaveBeenCalled();
  });

  it('reports a say that failed, with its exit code and what it wrote', async () => {
    const t = setup((command) => (command === MAC_SAY ? { exitCode: 1, stderr: 'Opening output file failed: wht?\n' } : listing(command)));
    await expect(t.backend.send({ op: 'speak', voice: ALBERT, text: TEXT, file: '/nonexistent/x.wav' })).rejects.toThrow(
      /say exited with 1: Opening output file failed: wht\?/,
    );
  });

  it('says why when a process cannot be started, in the words the pane shows', async () => {
    const t = setup(() => new Error('Executable not found: /usr/bin/osascript'));
    const attempt = t.backend.send({ op: 'voices' });
    await expect(attempt).rejects.toThrow(/Cannot start osascript: Executable not found/);
    await expect(attempt).rejects.toMatchObject({ kind: 'local-server-down' });
    expect(t.backend.state()).toMatchObject({ running: 0, spawned: 0, lastError: expect.stringMatching(/Executable not found/) });
  });

  it('bounds every process by the timeout and kills one that overran, rather than waiting', async () => {
    const t = setup(() => 'hang', 20);
    const attempt = t.backend.send({ op: 'voices' });
    await expect(attempt).rejects.toThrow(/osascript did not finish within 0 s/);
    await expect(attempt).rejects.toBeInstanceOf(SynthesisError);
    expect(t.killed()).toBe(1);
    expect(t.backend.state()).toMatchObject({ running: 0 });
  });

  it('counts what is in flight, and stop() kills it and forgets the listing', async () => {
    const t = setup((command) => (command === MAC_SAY ? 'hang' : listing(command)));
    await t.backend.send({ op: 'voices' });
    const pending = t.backend.send({ op: 'speak', voice: ALBERT, text: TEXT, file: '/tmp/f.wav' });
    await vi.waitFor(() => expect(t.backend.state()).toMatchObject({ running: 1 }));
    t.backend.stop();
    expect(t.killed()).toBe(1);
    await expect(pending).rejects.toThrow(/say exited with -15/);
    expect(t.backend.state()).toMatchObject({ running: 0, voices: null });
  });

  it('reset() forgets the last error, which is what Test connection retries after', async () => {
    const t = setup(() => ({ exitCode: 1, stderr: 'boom' }));
    await expect(t.backend.send({ op: 'voices' })).rejects.toThrow();
    expect(t.backend.state().lastError).toMatch(/boom/);
    t.backend.reset();
    expect(t.backend.state().lastError).toBeNull();
  });
});
