import webpack from 'webpack'

export default {
  mode: 'production',
  entry: './src/index.mjs',
  output: {
    filename: 'webpack-cloudflare.js',
  },
  resolve: {
    conditionNames: ['import', 'workerd'],
    // Workers' nodejs_compat flag exposes node: builtins at runtime, but
    // webpack still needs to know how to traverse the URI. Marking the
    // ones pg-cloudflare uses as externals leaves them as bare imports
    // in the bundle.
  },
  externals: [
    ({ request }, callback) => {
      if (request && /^node:/.test(request)) {
        return callback(null, 'module ' + request)
      }
      callback()
    },
  ],
  experiments: { outputModule: true },
  output: {
    filename: 'webpack-cloudflare.mjs',
    library: { type: 'module' },
  },
  plugins: [
    // ignore cloudflare:sockets imports
    new webpack.IgnorePlugin({
      resourceRegExp: /^cloudflare:sockets$/,
    }),
  ],
}
