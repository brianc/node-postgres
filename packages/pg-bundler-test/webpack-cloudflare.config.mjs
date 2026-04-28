import webpack from 'webpack'

export default {
  mode: 'production',
  entry: './src/index.mjs',
  output: {
    filename: 'webpack-cloudflare.mjs',
    library: { type: 'module' },
  },
  resolve: {
    conditionNames: ['import', 'workerd'],
  },
  // Workers' nodejs_compat exposes node: builtins at runtime; mark them
  // external so webpack leaves them as bare imports.
  externals: [
    ({ request }, callback) => {
      if (request?.startsWith('node:')) {
        return callback(null, 'module ' + request)
      }
      callback()
    },
  ],
  experiments: { outputModule: true },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^cloudflare:sockets$/,
    }),
  ],
}
