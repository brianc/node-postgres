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
      <svg
        version="1.0"
        xmlns="http://www.w3.org/2000/svg"
        height={48}
        width={48}
        viewBox="0 0 1024.000000 1024.000000"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#3c873a" stroke="none">
          <path
            d="M4990 7316 c-391 -87 -703 -397 -1003 -996 -285 -568 -477 -1260
-503 -1811 l-7 -142 -112 7 c-103 5 -207 27 -382 78 -37 11 -44 10 -63 -7 -61
-55 17 -180 177 -285 91 -60 194 -103 327 -137 l104 -26 17 -71 c44 -183 152
-441 256 -613 125 -207 322 -424 493 -541 331 -229 774 -291 1113 -156 112 45
182 94 209 147 13 24 13 35 -1 90 -22 87 -88 219 -134 267 -46 49 -79 52 -153
14 -168 -85 -360 -54 -508 83 -170 157 -244 440 -195 743 50 304 231 601 430
706 168 89 332 60 463 -81 66 -71 110 -140 197 -315 83 -166 116 -194 203
-170 88 23 370 258 637 531 411 420 685 806 808 1139 54 145 71 243 71 410 1
128 -3 157 -27 243 -86 310 -243 543 -467 690 -207 137 -440 157 -966 85
l-161 -22 -94 41 c-201 87 -327 113 -533 112 -77 -1 -166 -7 -196 -13z m-89
-1357 c15 -10 34 -38 43 -61 23 -56 13 -111 -28 -156 -59 -64 -171 -54 -216
21 -35 57 -22 145 28 190 44 40 122 43 173 6z m-234 -1361 c-46 -74 -156 -188
-249 -258 -211 -159 -459 -219 -734 -179 l-76 12 89 28 c187 60 485 229 683
388 l75 60 122 0 122 1 -32 -52z"
          />
        </g>
      </svg>
      <span style={{ fontWeight: 800 }}>node-postgres</span>
    </>
  ),
  chat: {
    link: 'https://discord.gg/2afXp5vUWm',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="shortcut icon" href="/favicon.ico" />
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
