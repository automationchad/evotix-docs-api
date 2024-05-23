import { Hono, Context, Next } from 'hono';
import { logger } from 'hono/logger';
import ask from './routes/ask';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_KEY
);

const app = new Hono();
app.use(logger());

const verifyToken = async (c: Context, next: Next) => {
	const token = c.req.header('Authorization')?.replace('Bearer ', '');
	console.log(token);
	if (!token) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	const { data, error } = await supabase
		.from('tokens')
		.select('user_id, api_call_count')
		.eq('token', token)
		.single();
	if (error || !data) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	// Update api_call_count
	await supabase
		.from('tokens')
		.update({ api_call_count: data.api_call_count + 1 })
		.eq('token', token);

	c.set('user', data);
	await next();
};

app.use('/ask', verifyToken);

app.get('/', (c) => {
	return c.json({
		message: `Welcome to the Evotix Documentation API! Integrate seamlessly with our platform. For detailed instructions, examples, and best practices, refer to the documentation. Happy coding! Made by William Marzella 2024`,
	});
});

app.route('/ask', ask);

const server = Bun.serve({
	fetch: app.fetch,
	port: process.env.PORT || 3030,
});

console.log(`Listening on ${server.url}`);
