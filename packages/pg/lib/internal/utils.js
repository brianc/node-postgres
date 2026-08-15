'use strict'

exports.normalizeQueryConfig = (config, values, callback) => {
  let text = undefined

  if (typeof config === 'string') {
    text = config
    config = {}
  }

  if (typeof values === 'function') {
    callback = values
    values = undefined
  }

  return {
    config,
    text: text ?? config.text,
    values: values || config.values,
    callback: callback || config.callback,
  }
}
