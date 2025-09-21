/**
 * Wraps a promise to enable error handling without a try-catch block,
 * inspired by the `await-to-js` library. This allows for a cleaner,
 * functional approach to handling asynchronous operations that might fail.
 *
 * @template T The type of the resolved value of the promise.
 * @param promise The promise to be wrapped.
 * @returns A promise that always resolves to a tuple. If the original
 *          promise resolves, the tuple is `[null, data]`. If it rejects,
 *          the tuple is `[error, undefined]`.
 */
export function to<T>(
  promise: Promise<T>,
): Promise<[Error, undefined] | [null, T]> {
  return promise
    .then<[null, T]>((data) => [null, data])
    .catch<[Error, undefined]>((err) => [err, undefined]);
}
