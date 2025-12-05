import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Serve privacy policy HTML page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});

export default router;
