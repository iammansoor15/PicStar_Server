export function normalizeBaseUrl(value, name = 'BASE_URL') {
    let url;
    try {
        url = new URL(typeof value === 'string' ? value.trim() : '');
    } catch {
        throw new Error(`Set ${name} to a valid HTTP(S) origin in the server .env or environment.`);
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || !/^\/*$/.test(url.pathname)) {
        throw new Error(`${name} must be an HTTP(S) origin without credentials, a path, query, or fragment.`);
    }
    return url.origin;
}
