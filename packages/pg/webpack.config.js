const path = require('path');
var webpack = require('webpack')
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")

module.exports = {
  entry: './lib/index.js',
  mode: 'production',
  // mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webpack-bundle.js',
    library: {
        name: 'PG',
        type: 'umd',
    },
    // libraryTarget: 'umd',
    globalObject: 'this',
  },
  resolve: {
      fallback: {
          // crypto: require.resolve("crypto-browserify"),
          // path: require.resolve('path-browserify'),
          // stream: require.resolve('stream-browserify'),
          fs: false,
          // ws: require.resolve('nextjs-websocket'),
          tls: require.resolve('tls-browserify'),
          // dns: require.resolve('@i2labs/dns'),
          dns: false,
          // buffer: require.resolve('buffer/'),
      }
  },
//   stats: {
//       errorDetails: true
//   },
  plugins: [
    new webpack.IgnorePlugin({resourceRegExp: /^pg-native$/}),
    new webpack.IgnorePlugin({resourceRegExp: /^net$/}),
    // new webpack.ProvidePlugin({
    //     process: 'process/browser',
    // }),
    // new webpack.ProvidePlugin({
    //     Buffer: ['buffer', 'Buffer'],
    // }),
    new NodePolyfillPlugin(),
  ],
  devtool: false,
  // stats: {
  //   chunkModules: true,
  // },
};