import { Router } from 'express';
import config from '../config/config.js';

const router = Router();

router.get('/public-config.js', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript').send(
        `window.APP_CONFIG=${JSON.stringify({ API_BASE_URL: config.app.publicApiBaseUrl })};`
    );
});

export default router;
