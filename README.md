# Worker Links (URL Shortener)

A simple URL Shortener for Cloudflare Workers, using Workers KV. Redirect short URLs at the edge of the Cloudflare network to keep latency down and access fast!

I run this code in production on [erisa.link](https://erisa.link/example), though the root name redirects and without the secret it doesn't make a very good demo.

It was made for my personal use but is available publicly in the hopes that it may be useful to someone somewhere.

## Usage

To deploy to your Cloudflare Workers account, edit the relevant entries in `wrangler.toml`, add a secret with `wrangler put WORKERLINKS_SECRET` and use `wrangler publish`.  
For debugging, you can use `wrangler preview`, though note you will need to login and configure a preview KV namespace in `wrangler.toml`.

Once deployed, interacting with the API should be rather simple. It's based on headers, specifically with the `Authorization` and `URL` headers.

To create a short URL with a random URL, send a `POST` to `/` with `Authorization` and `URL` headers:

```json
erisa@Tuturu:~$ curl -X POST -H "Authorization: mysecret" -H "URL: https://erisa.moe" https://erisa.link/
{
  "message": "URL created succesfully.",
  "key": "q2w083eq",
  "shorturl": "https://erisa.link/q2w083eq",
  "longurl": "https://erisa.moe"
}
```

And you can test it worked if you wish:

```http
erisa@Tuturu:~$ curl https://erisa.link/q2w083eq -D-
HTTP/2 302
date: Fri, 11 Sep 2020 12:43:04 GMT
content-length: 0
location: https://erisa.moe
server: cloudflare
..other ephemeral headers..
```

To create or update a custom short URl, send a `PUT` to the intended target URL:

```json
erisa@Tuturu:~$ curl -X PUT -H "Authorization: mysecret" -H "URL: https://erisa.moe" https://erisa.link/mywebsite
{
  "message": "URL created succesfully.",
  "key": "mywebsite",
  "shorturl": "https://erisa.link/mywebsite",
  "longurl": "https://erisa.moe"
}
```

And to delete an existing shortlink, send a `DELETE` to it with only the `Authorization` header:

```json
erisa@Tuturu:~$ curl -X DELETE -H "Authorization: mysecret" https://erisa.link/keytodelete
{
  "message": "Short URL deleted succesfully.",
  "key": "keytodelete",
  "shorturl": "https://erisa.link/keytodelete",
  "longurl": "https://erisa.moe"
}
```

It is a planned feature to be able to list all URLs via a `GET` on `/` with `Authorization`.

For the time being you can view them from your Cloudflare Dashboard:  
Cloudflare Dashboard -> Workers -> KV -> View on the namespace.

Or with the `wrangler` tool.  
For example if you are in the project directory and have your `wrangler.toml` configured correctly, this should just be `wrangler kv:key list --binding kv`

## Security

This code is relatively simple but still, if you find any security issues that can be exploited publicly, please reach out to me via email: `seriel (at) erisa.moe` with any relevant details.

If you don't have access to Workers KV you're welcome to test these issues on my live `erisa.link`, provided you don't send excessive (constant) requests or delete/modify any keys except ones created by you or the `/sample` key.

If I don't respond to your email for whatever reason please feel free to publicly open an issue.
