# jsprerender
A prerender server for ReactJS, VueJS, Angular pages.

You can setup the rendering behaviour on config.json: 

```
{
    "server": {
        "port": 3001,
        "maxListeners": 50
    },
    "cache": {
        "ttl": "2d",
        "directory": "./cache",
        "minContentSize": 1000
    },
    "pages": [
        {
            "url": "*",
            "waitForSelector": "meta[name=\"twitter:card\"]"
        },
        {
            "url": "https://homeofmysite.com.br/",
            "waitForSelector": null
        }
    ]
}
```

Cache TTL uses [DurationJS](https://www.npmjs.com/package/duration-js) conventions for:
- m: minute
- h: hour
- d: day
- w: week

```page.url``` can be absolute pages urls but also accepts javascript Regular Expressions, they must start with ```ER:``` like ```'ER:.*mypattern.*'```. The lonely ```*```char on ```page.url``` means "the default selector".

```waitForSelector``` is a valid CSS3 selector that refers to a page element that will signal the browser that your page is ready to be cached. The ```null``` value is used to indicate: "don't wait for anything".

```minContentSize``` is the miminum amount of bytes to consider the page sane and proper rendered to be cached.

You can test the server using:
```curl 'http://127.0.0.1:3001/?url=https://%mysite.com.br/mypage'```

And if you don't want the test page to be cached add the string 'debug' anywhere on the url:
```curl 'http://127.0.0.1:3001/?url=https://mysite.com%/mypage?debug'```.
