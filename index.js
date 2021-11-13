addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest(request) {
  let secret

  // Set this in your worker's environment. wrangler.toml or cloudflare dashboard
  if (WORKERLINKS_SECRET === undefined ) {
    return new Response("Secret is not defined. Please add WORKERLINKS_SECRET.")
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
      return new Response(
        JSON.stringify({
          code: '405 Method Not Allowed',
          message: 'POST not valid for individual keys. Did you mean PUT?',
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }
    key =
      '/' +
      Math.random()
        .toString(36)
        .slice(5)
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
      return new Response(
        JSON.stringify(
          {
            code: '404 Not Found',
            message: 'Key does not exist or has not propagated.',
          },
          null,
          2,
        ),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    } else {
      return new Response(null, { status: 302, headers: { Location: url } })
    }
  } else if (request.method == 'DELETE') {
    if (request.headers.get('Authorization') != secret) {
      return new Response(
        JSON.stringify(
          {
            code: '401 Unauthorized',
            message: 'Unauthorized.',
          },
          null,
          2,
        ),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }

    shorturl = new URL(request.url).origin + key
    let url = await kv.get(key)
    if (url == null) {
      return new Response(
        JSON.stringify(
          {
            code: '404 Not Found',
            message: 'Key does not exist or has not propagated.',
          },
          null,
          2,
        ),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    } else {
      kv.delete(key)
      return new Response(
        JSON.stringify(
          {
            message: 'Short URL deleted succesfully.',
            key: key.substr(1),
            shorturl: shorturl,
            longurl: url,
          },
          null,
          2,
        ),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }
  }

  return new Response(
    JSON.stringify(
      {
        code: '405 Method Not Allowed',
        message:
          'Unsupported method. Please use one of GET, PUT, POST, DELETE, HEAD.',
      },
      null,
      2,
    ),
    {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
      },
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
    return new Response(
      JSON.stringify(
        {
          code: '401 Unauthorized',
          message: 'Unauthorized.',
        },
        null,
        2,
      ),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }

  if (url == null || !validateUrl(url)) {
    return new Response(
      JSON.stringify(
        {
          code: '400 Bad Request',
          message: "No valid URL given. Please set a 'URL' header.",
        },
        null,
        2,
      ),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }

  await kv.put(key, url)
  return new Response(
    JSON.stringify(
      {
        message: 'URL created succesfully.',
        key: key.substr(1),
        shorturl: shorturl,
        longurl: url,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}
