const path = require('path');
var webpack = require('webpack')
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")

module.exports = {
  entry: './lib/index.js',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webpack-bundle.js',
    library: {
        name: 'PG',
        type: 'umd',
    },
    globalObject: 'this',
  },
  resolve: {
      fallback: {
          fs: false,
          tls: require.resolve('tls-browserify'),
          dns: false,
      }
  },
  plugins: [
    new webpack.IgnorePlugin({resourceRegExp: /^pg-native$/}),
    new webpack.IgnorePlugin({resourceRegExp: /^net$/}),
    new NodePolyfillPlugin(),
  ],
  devtool: false,
};