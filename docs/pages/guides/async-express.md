---
title: Express with async/await
---

My preferred way to use node-postgres (and all async code in node.js) is with `async/await`. I find it makes reasoning about control-flow easier and allows me to write more concise and maintainable code.

This is how I typically structure express web-applications with node-postgres to use `async/await`:

```
- app.js
- index.js
- routes/
  - index.js
  - photos.js
  - user.js
- db/
  - index.js <--- this is where I put data access code
```

That's the same structure I used in the [project structure](/guides/project-structure) example.

My `db/index.js` file usually starts out like this:

```js
import pg from 'pg'
const { Pool } = pg

const pool = new Pool()

export const query = (text, params) => pool.query(text, params)
```

Then I will install [express-promise-router](https://www.npmjs.com/package/express-promise-router) and use it to define my routes. Here is my `routes/user.js` file:

```js
import Router from 'express-promise-router'
import db from '../db.js'

// create a new express-promise-router
// this has the same API as the normal express router except
// it allows you to use async functions as route handlers
const router = new Router()

// export our router to be mounted by the parent application
export default router

router.get('/:id', async (req, res) => {
  const { id } = req.params
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id])
  res.send(rows[0])
})
```

Then in my `routes/index.js` file I'll have something like this which mounts each individual router into the main application:

```js
// ./routes/index.js
import users from './user.js'
import photos from './photos.js'

const mountRoutes = (app) => {
  app.use('/users', users)
  app.use('/photos', photos)
  // etc..
}

export default mountRoutes
```

And finally in my `app.js` file where I bootstrap express I will have my `routes/index.js` file mount all my routes. The routes know they're using async functions but because of express-promise-router the main express app doesn't know and doesn't care!

```js
// ./app.js
import express from 'express'
import mountRoutes from './routes.js'

const app = express()
mountRoutes(app)

// ... more express setup stuff can follow
```

Now you've got `async/await`, node-postgres, and express all working together!
