// Vercel entry point: every dynamic route (API, pages, sitemap) lands here, see vercel.json.
import { handle } from '../core.js';

export default function handler(req, res) {
  return handle(req, res);
}
