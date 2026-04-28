// Augment node:assert with the helper methods that `_test-helper.ts` attaches
// at runtime via `Object.assign(nodeAssert, ext)`. Tests across the package
// import `assert from 'node:assert'` and rely on these helpers.
import 'node:assert'

declare module 'assert' {
  function same(actual: Record<string, unknown>, expected: Record<string, unknown>): void
  function emits(
    item: { once(event: string, cb: (...args: unknown[]) => void): void },
    eventName: string,
    callback?: (...args: any[]) => any,
    message?: string
  ): void
  function UTCDate(
    actual: Date,
    year: number,
    month: number,
    day: number,
    hours: number,
    min: number,
    sec: number,
    ms: number
  ): void
  function equalBuffers(actual: ArrayLike<number>, expected: ArrayLike<number>): void
  function empty(actual: ArrayLike<unknown> | null | undefined): void
  // assert.success unwraps err from the wrapped callback. Tests typically write
  // `assert.success(function (result) { ... })` and expect `result` to be the
  // success value (not the error). All inner callback parameters default to
  // `any` so test code can omit annotations.
  function success(callback: (...args: any[]) => unknown): (err: Error | undefined, ...rest: any[]) => void
  function lengthIs(actual: ArrayLike<unknown>, expectedLength: number, message?: string): void
  // assert.calls returns a function with the same shape as its input. The inner
  // callback's parameters default to `any` so simple tests don't need explicit
  // annotations; passing it where a more specific shape is expected (e.g. the
  // `pool.connect` callback) will let TS contextually type the returned shape.
  function calls<A extends any[]>(callback: (...args: A) => unknown, timeout?: number): (...args: A) => void
  function calls(callback: (...args: any[]) => unknown, timeout?: number): (...args: any[]) => void
  function isNull(item: unknown, message?: string): void
}
