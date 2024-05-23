import { Hono } from 'hono';
import { logger } from 'hono/logger';
import ask from './routes/ask';

const app = new Hono();
app.use(logger());

app.get('/', (c) => {
	return c.json({ message: 'Hello World' });
});

app.route('/ask', ask);

const server = Bun.serve({
	fetch: app.fetch,
	port: process.env.PORT || 3030,
});

console.log(`Listening on ${server.url}`);