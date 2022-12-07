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
      <h1>Node Postgres</h1>
    </>
  ),
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Nextra: the next docs builder" />
      <meta name="og:title" content="Nextra: the next docs builder" />
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
