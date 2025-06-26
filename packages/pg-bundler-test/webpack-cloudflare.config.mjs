import webpack from 'webpack'

export default {
  mode: 'production',
  entry: './src/index.mjs',
  output: {
    filename: 'webpack-cloudflare.js',
  },
  resolve: { conditionNames: ['import', 'workerd'] },
  plugins: [
    // ignore cloudflare:sockets imports
    new webpack.IgnorePlugin({
      resourceRegExp: /^cloudflare:sockets$/,
    }),
  ],
}
