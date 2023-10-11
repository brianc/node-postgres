// theme.config.js
export default {
  project: {
    link: 'https://github.com/brianc/node-postgres',
  },
  twitter: {
    cardType: 'summary_large_image',
    site: 'https://node-postgres.com',
  },
  docsRepositoryBase: 'https://github.com/brianc/node-postgres/blob/master/docs', // base URL for the docs repository
  titleSuffix: ' – node-postgres',
  darkMode: true,
  footer: true,
  navigation: {
    prev: true,
    next: true,
  },
  footer: {
    text: `MIT ${new Date().getFullYear()} © Brian Carlson.`,
  },
  editLink: {
    text: 'Edit this page on GitHub',
  },
  logo: (
    <>
      <svg>...</svg>
      <span>node-postgres</span>
    </>
  ),
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="node-postgres is a collection of node.js modules for interfacing with your PostgreSQL database."
      />
      <meta name="og:title" content="node-postgres" />
      <script async src="https://www.googletagmanager.com/gtag/js?id=UA-100138145-1"></script>
      <script
        dangerouslySetInnerHTML={{
          __html: `
      
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'UA-100138145-1');

      `,
        }}
      ></script>
    </>
  ),
}
