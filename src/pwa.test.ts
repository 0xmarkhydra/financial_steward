import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const path = (relative: string) => resolve(process.cwd(), relative);

describe('installable web PWA', () => {
  const manifest = JSON.parse(readFileSync(path('public/manifest.webmanifest'), 'utf8'));
  it('has a standalone manifest with same-origin scope', () => {
    expect(manifest.name).toContain('Quản gia');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    const page = readFileSync(path('index.html'), 'utf8');
    expect(page).toContain('rel="manifest"');
    expect(page).toContain('apple-touch-icon');
  });
  it('includes a clearly marked MCP guide', () => {
    const app=readFileSync(path('src/App.tsx'),'utf8');
    const guide=readFileSync(path('src/MCPPage.tsx'),'utf8');
    expect(app).toContain("label:'Kết nối ChatGPT'");
    expect(guide).toContain('Chưa xác nhận máy chủ OAuth đã sẵn sàng');
    expect(guide).toContain('tools/list');
  });
  it('ships valid PNG icons for install and iOS', () => {
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const png = readFileSync(path('public' + icon.src));
      const size = Number(icon.sizes.split('x')[0]);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
    const apple = readFileSync(path('public/apple-touch-icon.png'));
    expect(apple.readUInt32BE(16)).toBe(180);
  });
  it('never intercepts finance API, MCP or authenticated requests', () => {
    const handlers = new Map<string, (event: any) => void>();
    const self = {
      location: { origin: 'https://finance.example' },
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
    };
    runInNewContext(readFileSync(path('public/sw.js'), 'utf8'), { self, URL, Set, caches: { match: async () => ({ ok: true }) } });
    const fetchHandler = handlers.get('fetch')!;
    for (const url of ['/api/v1/state', '/api/v1/auth/login', '/mcp', '/healthz', '/private/user.jpg', '/assets/app.js']) {
      let intercepted = false;
      const request = { url: 'https://finance.example' + url, method: 'GET', mode: 'cors', destination: 'script', cache: 'default', headers: new Headers() };
      fetchHandler({ request, respondWith: () => { intercepted = true; } });
      if (url === '/assets/app.js') expect(intercepted).toBe(true);
      else expect(intercepted).toBe(false);
    }
    let intercepted = false;
    fetchHandler({
      request: { url: 'https://finance.example/assets/file.js', method: 'GET', mode: 'cors', destination: 'script', cache: 'default', headers: new Headers({ authorization: 'Bearer private' }) },
      respondWith: () => { intercepted = true; },
    });
    expect(intercepted).toBe(false);
  });
});
