# conjure-typescript-runtime
A light-weight Promise based HTTP client library for the browser.

## Overview

conjure-typescript-runtime leverages [fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) to provide a
simple interface for making HTTP requests. conjure-typescript-runtime was designed to handle the RPC layer for
clients generated by [Conjure-TypeScript](https://github.com/palantir/conjure-typescript).

__Browser compatibility__: This library uses fetch so you should ensure that your runtime environment supports ES6 features.

## Example

```typescript
import { DefaultHttpApiBridge, MediaType } from "conjure-client";
import { SomeService } from "some-conjure-api";

const bridge = new DefaultHttpApiBridge({
    baseUrl: "https://some.base.url.com",
    userAgent: {
        productName: "yourProductName",
        productVersion: "1.0.0"
    }
})

const service = new SomeService(bridge);
service.getSomeResult()
    .then(function (response) {
        // handle success
        console.log(response);
    })
    .catch(function (error) {
        // handle error
        console.log(error);
    })
    .then(function () {
        // always executed
    });
```


## Contributing

See the [CONTRIBUTING.md](./CONTRIBUTING.md) document.

## License
This project is made available under the [Apache 2.0 License](/LICENSE).
