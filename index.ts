import { Hono } from 'hono';
import ask from './routes/ask';

const app = new Hono();

app.route('/ask', ask);

Bun.serve({
	fetch: app.fetch,
	port: process.env.PORT || 3030,
});
