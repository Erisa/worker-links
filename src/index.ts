import { Context as HonoContext, Env as HonoEnv, Hono } from 'hono'
import * as st from 'simple-runtypes'

type Variables = {
	path: string
	key: string
	shortUrl: string
}

type Bindings = {
	WORKERLINKS_SECRET: string
	PLAUSIBLE_HOST?: string
	KV: KVNamespace
	kv: KVNamespace
}

const url = st.runtype((v) => {
	const stringCheck = st.use(st.string(), v)
	if (!stringCheck.ok) return stringCheck.error

	try {
		new URL(stringCheck.result)
		return stringCheck.result
	} catch {
		return st.createError('Must be a valid URL')
	}
})

const bulkValidator = st.dictionary(
	// Starting `/` and no ending `/`
	st.string({ match: /^\/.*?[^\/]$/ }),
	url,
)

const checkAuth = (c: Context) =>
	c.req.headers.get('Authorization') === c.env.WORKERLINKS_SECRET

const unauthorized = (c: Context) =>
	c.json({ code: '401 Unauthorized', message: 'Unauthorized' }, 401)

type Env = {
	Bindings: Bindings
	Variables: Variables
}
type Context = HonoContext<Env>
const app = new Hono<Env>()

// store the path, key and short url for reference in requeests
// e.g. c.get('key')
app.use('*', async (c, next) => {
	const path = new URL(c.req.url).pathname
	let key = path !== '/' ? path.replace(/\/$/, '') : path
	let shortUrl = new URL(key, c.req.url).toString()

	c.set('path', path)
	c.set('key', key)
	c.set('shortUrl', shortUrl)

	// backwards compat
	// i could have left env.kv alone, but i like them being CAPITALS.
	// what can i say?
	if (c.env.KV == undefined && c.env.kv !== undefined) {
		c.env.KV = c.env.kv
		console.warn('WARN: Please change your kv binding to be called KV.')
	}

	await next()
})

// handle auth
app.use('*', async (c, next) => {
	c.res.headers.set('Vary', 'Authorization')

	if (c.env.WORKERLINKS_SECRET === undefined) {
		return c.text('Secret is not defined. Please add WORKERLINKS_SECRET.')
	}

	if (!['GET', 'HEAD'].includes(c.req.method) && !checkAuth(c)) {
		return unauthorized(c)
	}

	await next()
})

// retrieve list of keys
app.get('/', async (c) => {
	if (c.req.header('Authorization')) {
		if (!checkAuth(c)) {
			return unauthorized(c)
		}

		let { prefix, cursor, limit: limitStr } = c.req.query()
		prefix = prefix ? decodeURIComponent(prefix) : '/'
		cursor = cursor ? decodeURIComponent(cursor) : ''
		let limit = limitStr ? parseInt(decodeURIComponent(limitStr)) : 1000

		let { keys, ...list } = await c.env.KV.list({
			limit,
			prefix: prefix.startsWith('/') ? prefix : '/' + prefix,
			cursor,
		})

		return c.json({
			...list,
			links: keys.map((key) => ({
				key: key.name,
			})),
		})
	} else {
		return handleGetHead(c)
	}
})

// retrieve key
app.get('*', handleGetHead)

// same but for HEAD
app.head('*', handleGetHead)

// handle both GET and HEAD
async function handleGetHead(c: Context) {
	// actual logic goes here
	const urlResult = await c.env.KV.get(c.get('key'))

	if (urlResult == null) {
		return c.json(
			{ code: '404 Not Found', message: 'Key does not exist.' },
			404,
		)
	} else {
		const searchParams = new URL(c.req.url).searchParams
		const newUrl = new URL(urlResult)
		searchParams.forEach((value, key) => {
			newUrl.searchParams.append(key, value)
		})

		if (c.env.PLAUSIBLE_HOST !== undefined) {
			c.executionCtx.waitUntil(sendToPlausible(c))
		}

		return c.redirect(newUrl.toString(), 302)
	}
}

// delete specific key
app.delete('*', async (c) => {
	const urlResult = await c.env.KV.get(c.get('key'))

	if (urlResult == null) {
		return c.json(
			{ code: '404 Not Found', message: 'Key does not exist.' },
			404,
		)
	} else {
		await c.env.KV.delete(c.get('key'))
		return c.json({
			message: 'Short URL deleted succesfully.',
			key: c.get('key').slice(1),
			shorturl: c.get('shortUrl'),
			longurl: urlResult,
		})
	}
})

// add specific key
app.put('*', createLink)

// add random key
app.post('/', async (c) => {
	const rawBody = await c.req.text()

	if (!rawBody) {
		c.set('key', '/' + Math.random().toString(36).slice(5))
		c.set('shortUrl', new URL(c.get('key'), c.req.url).toString())
		return await createLink(c)
	} else {
		// Bulk upload from body

		let json: unknown
		try {
			json = JSON.parse(rawBody)
		} catch {
			return c.json(
				{
					code: '400 Bad Request',
					message: 'Body must be valid JSON, or none at all.',
				},
				400,
			)
		}

		const result = st.use(bulkValidator, json)
		if (!result.ok) {
			return c.json(
				{
					code: '400 Bad Request',
					message: 'Body must be a standard JSON object mapping keys to urls.',
					example: {
						'/short': 'https://example.com/really-really-really-long-1',
						'/other': 'https://subdomain.example.com/and-some-long-path',
					},
				},
				400,
			)
		}

		for (const [key, url] of Object.entries(result.result)) {
			await c.env.KV.put(key, url)
		}

		return Response.json(
			{
				message: 'URLs created successfully',
				entries: Object.entries(result.result).map(([key, longurl]) => ({
					key: key.slice(1),
					shorturl: new URL(key, c.req.url),
					longurl,
				})),
			},
			{ status: 200 },
		)
	}
})

async function createLink(c: Context) {
	const url = c.req.headers.get('URL')

	if (url == null || !validateUrl(url)) {
		return c.json(
			{
				code: '400 Bad Request',
				message: "No valid URL given. Please set a 'URL' header.",
			},
			400,
		)
	}

	await c.env.KV.put(c.get('key'), url)
	return Response.json(
		{
			message: 'URL created succesfully.',
			key: c.get('key').slice(1),
			shorturl: c.get('shortUrl'),
			longurl: url,
		},
		{
			status: 200,
		},
	)
}

app.post('/*', async (c) =>
	c.json(
		{
			code: '405 Method Not Allowed',
			message: 'POST not valid for individual keys. Did you mean PUT?',
		},
		405,
	),
)

app.all('*', (c) =>
	c.json(
		{
			code: '405 Method Not Allowed',
			message:
				'Unsupported method. Please use one of GET, PUT, POST, DELETE, HEAD.',
		},
		405,
	),
)

// PLAUSIBLE_HOST should be the full URL to your Plausible Analytics instance
// e.g. https://plausible.io/
async function sendToPlausible(c: Context) {
	const url = c.env.PLAUSIBLE_HOST + 'api/event'
	const headers = new Headers()
	headers.append('User-Agent', c.req.headers.get('User-Agent') || '')
	headers.append('X-Forwarded-For', c.req.headers.get('X-Forwarded-For') || '')
	headers.append('Content-Type', 'application/json')

	const data = {
		name: 'pageview',
		url: c.req.url,
		domain: new URL(c.req.url).hostname,
		referrer: c.req.referrer,
	}
	await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) })
}

function validateUrl(url: string) {
	// quick and dirty validation
	if (url == '') {
		return false
	}
	try {
		new URL(url)
	} catch (TypeError) {
		return false
	}
	return true
}

export default app
