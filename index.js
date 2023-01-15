let secret

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event))
})

/**
 * Respond to the request
 * @param {Event} event
 */
async function handleRequest(event) {
  const { request } = event
  // Set this in your worker's environment. wrangler.toml or cloudflare dashboard
  if (WORKERLINKS_SECRET === undefined) {
    return new Response('Secret is not defined. Please add WORKERLINKS_SECRET.')
  } else {
    secret = WORKERLINKS_SECRET
  }

  var key = new URL(request.url).pathname
  var shorturl = new URL(request.url).origin + key

  if (request.method == 'PUT') {
    return await putLink(
      request.headers.get('Authorization'),
      shorturl,
      key,
      request.headers.get('URL'),
    )
  } else if (request.method == 'POST') {
    if (key != '/') {
      return Response.json(
        {
          code: '405 Method Not Allowed',
          message: 'POST not valid for individual keys. Did you mean PUT?',
        },
        {
          status: 405,
        },
      )
    }
    key = '/' + Math.random().toString(36).slice(5)
    shorturl = new URL(request.url).origin + key
    return await putLink(
      request.headers.get('Authorization'),
      shorturl,
      key,
      request.headers.get('URL'),
    )
  } else if (request.method == 'GET' || request.method == 'HEAD') {
    let url = await kv.get(key)
    if (url == null) {
      return Response.json(
        {
          code: '404 Not Found',
          message: 'Key does not exist or has not propagated.',
        },
        {
          status: 404,
        },
      )
    } else {
      // PLAUSIBLE_HOST should be the full URL to your Plausible Analytics instance
      // e.g. https://plausible.io/
      if (typeof PLAUSIBLE_HOST !== 'undefined') {
        const url = PLAUSIBLE_HOST + 'api/event'
        const headers = new Headers()
        headers.append('User-Agent', request.headers.get('User-Agent'))
        headers.append(
          'X-Forwarded-For',
          request.headers.get('X-Forwarded-For'),
        )
        headers.append('Content-Type', 'application/json')

        const data = {
          name: 'pageview',
          url: request.url,
          domain: new URL(request.url).hostname,
          referrer: request.referrer,
        }
        event.waitUntil(
          fetch(url, { method: 'POST', headers, body: JSON.stringify(data) }),
        )
      }
      return new Response(null, { status: 302, headers: { Location: url } })
    }
  } else if (request.method == 'DELETE') {
    if (request.headers.get('Authorization') != secret) {
      return Response.json(
        {
          code: '401 Unauthorized',
          message: 'Unauthorized.',
        },
        {
          status: 401,
        },
      )
    }

    shorturl = new URL(request.url).origin + key
    let url = await kv.get(key)
    if (url == null) {
      return Response.json(
        {
          code: '404 Not Found',
          message: 'Key does not exist or has not propagated.',
        },
        {
          status: 404,
        },
      )
    } else {
      await kv.delete(key)
      return Response.json(
        {
          message: 'Short URL deleted succesfully.',
          key: key.substr(1),
          shorturl: shorturl,
          longurl: url,
        },
        {
          status: 200,
        },
      )
    }
  }

  return Response.json(
    {
      code: '405 Method Not Allowed',
      message:
        'Unsupported method. Please use one of GET, PUT, POST, DELETE, HEAD.',
    },
    {
      status: 405,
    },
  )
}

function validateUrl(url) {
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

async function putLink(givenSecret, shorturl, key, url) {
  if (givenSecret != secret) {
    return Response.json(
      {
        code: '401 Unauthorized',
        message: 'Unauthorized.',
      },
      {
        status: 401,
      },
    )
  }

  if (url == null || !validateUrl(url)) {
    return Response.json(
      {
        code: '400 Bad Request',
        message: "No valid URL given. Please set a 'URL' header.",
      },
      {
        status: 400,
      },
    )
  }

  await kv.put(key, url)
  return Response.json(
    {
      message: 'URL created succesfully.',
      key: key.substr(1),
      shorturl: shorturl,
      longurl: url,
    },
    {
      status: 200,
    },
  )
}
