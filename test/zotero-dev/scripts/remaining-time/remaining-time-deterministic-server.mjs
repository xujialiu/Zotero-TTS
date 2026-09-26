import http from 'node:http';

const port = Number(process.env.ZTTS_REMAINING_TIME_PORT || 8769);
const sampleRate = 16_000;
const makeAudio = seconds => {
  const samples = Math.round(sampleRate * seconds);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  return { seconds, base64: wav.toString('base64') };
};
const audioByVoice = { af_bella: makeAudio(3), af_heart: makeAudio(1.5) };
const counts = { voices: 0, captioned: 0, speech: 0 };

const send = (res, status, body, type = 'application/json') => {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': data.length, 'Access-Control-Allow-Origin': '*' });
  res.end(data);
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, Buffer.alloc(0));
  const delayed = req.url?.startsWith('/delay/');
  const route = delayed ? req.url.slice('/delay'.length) : req.url;
  if (req.method === 'GET' && route === '/v1/audio/voices') {
    counts.voices++;
    return send(res, 200, JSON.stringify({ voices: [{ id: 'af_bella', name: 'Deterministic Bella' }, { id: 'af_heart', name: 'Deterministic Heart' }] }));
  }
  if (req.method === 'GET' && route === '/stats') return send(res, 200, JSON.stringify(counts));
  if (req.method === 'POST' && (route === '/dev/captioned_speech' || route === '/v1/audio/speech')) {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      let input = '', voice = 'af_bella';
      try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); input = body.input || ''; voice = body.voice || voice; } catch (_) {}
      const audio = audioByVoice[voice] || audioByVoice.af_bella;
      const respond = () => {
        if (route === '/dev/captioned_speech') {
          counts.captioned++;
          const words = String(input).trim().split(/\s+/).filter(Boolean);
          const step = Math.max(0.03, (audio.seconds - 0.02) / Math.max(1, words.length));
          const timestamps = words.map((word, i) => ({ word, start_time: i * step, end_time: Math.min(audio.seconds - 0.02, (i + 1) * step) }));
          return send(res, 200, JSON.stringify({ audio: audio.base64, timestamps }));
        }
        counts.speech++;
        return send(res, 200, Buffer.from(audio.base64, 'base64'), 'audio/mpeg');
      };
      if (delayed) setTimeout(respond, 10000); else respond();
    });
    return;
  }
  send(res, 404, JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => process.stdout.write(JSON.stringify({ port, pid: process.pid }) + '\n'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
