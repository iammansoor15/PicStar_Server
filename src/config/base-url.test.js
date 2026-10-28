import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readConfig = `
  const { default: config } = await import('./src/config/config.js');
  console.log(JSON.stringify(config.app));
`;

function run(source, env = {}) {
    return spawnSync(process.execPath, ['--input-type=module', '-e', source], {
        cwd: root,
        encoding: 'utf8',
        env: {
            ...process.env,
            BASE_URL: '',
            SERVER_URL: '',
            PUBLIC_API_BASE_URL: '',
            DOTENV_CONFIG_QUIET: 'true',
            ...env,
        },
    });
}

function parse(result) {
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('server and web config use BASE_URL and normalize trailing slashes', () => {
    const config = parse(run(readConfig, { BASE_URL: 'https://new.example.test///' }));
    assert.equal(config.serverUrl, 'https://new.example.test');
    assert.equal(config.publicApiBaseUrl, config.serverUrl);
});

test('BASE_URL takes priority over legacy SERVER_URL', () => {
    const config = parse(run(readConfig, {
        BASE_URL: 'https://new.example.test',
        SERVER_URL: 'https://old.example.test',
    }));
    assert.equal(config.serverUrl, 'https://new.example.test');
});

test('existing deployments can still supply SERVER_URL through env', () => {
    const config = parse(run(readConfig, { SERVER_URL: 'http://localhost:10000/' }));
    assert.equal(config.serverUrl, 'http://localhost:10000');
});

test('missing and invalid URLs stop server startup', () => {
    for (const BASE_URL of ['', 'invalid', 'ftp://example.test', 'https://example.test/api']) {
        const result = run(readConfig, { BASE_URL });
        assert.notEqual(result.status, 0, `${BASE_URL} was accepted`);
        assert.match(result.stderr, /BASE_URL/);
    }
});

test('web pages receive the configured origin from the real HTTP route', () => {
    const result = parse(run(`
        import express from 'express';
        import { once } from 'node:events';
        import vm from 'node:vm';
        const { default: router } = await import('./src/routes/public-config-routes.js');
        const app = express();
        app.use(router);
        const server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        try {
            const response = await fetch('http://127.0.0.1:' + server.address().port + '/public-config.js');
            const context = { window: {} };
            vm.runInNewContext(await response.text(), context);
            console.log(JSON.stringify({
                status: response.status,
                cache: response.headers.get('cache-control'),
                config: context.window.APP_CONFIG,
            }));
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    `, { BASE_URL: 'https://web.example.test' }));
    assert.equal(result.status, 200);
    assert.equal(result.cache, 'no-store');
    assert.equal(result.config.API_BASE_URL, 'https://web.example.test');
});

test('explicit public API overrides are validated', () => {
    const config = parse(run(readConfig, {
        BASE_URL: 'https://server.example.test',
        PUBLIC_API_BASE_URL: 'https://public.example.test/',
    }));
    assert.equal(config.publicApiBaseUrl, 'https://public.example.test');
    const invalid = run(readConfig, { BASE_URL: 'https://server.example.test', PUBLIC_API_BASE_URL: 'invalid' });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /PUBLIC_API_BASE_URL/);
});
