// only newer versions of node support async iterator
if (!process.version.startsWith('v8')) {
  require('./async-iterator.es6')
}
