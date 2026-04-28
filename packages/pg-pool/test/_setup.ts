// Crash-on-warning setup shared by tests that opt-in. Import for side effects only.
const crash = (reason: 'unhandledRejection' | 'uncaughtException' | 'warning'): void => {
  process.on(reason, (err: Error) => {
    console.error(reason, err.stack)
    process.exit(-1)
  })
}

crash('unhandledRejection')
crash('uncaughtException')
crash('warning')

export {}
