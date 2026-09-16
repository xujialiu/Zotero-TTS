// Throwaway UI preview; serves only the standalone player prototype.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const page = await readFile(new URL('../addon/content/player-prototype.html', import.meta.url));
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(page);
});
server.listen(4318, '127.0.0.1', () => console.log('Player prototype: http://127.0.0.1:4318'));
