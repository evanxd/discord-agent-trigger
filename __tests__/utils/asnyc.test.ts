import { to } from "../../src/utils/asnyc";

describe("to", () => {
  it("should return [null, data] when the promise resolves", async () => {
    const data = "test data";
    const promise = Promise.resolve(data);
    const [err, result] = await to(promise);
    expect(err).toBeNull();
    expect(result).toBe(data);
  });

  it("should return [error, undefined] when the promise rejects", async () => {
    const error = new Error("test error");
    const promise = Promise.reject(error);
    const [err, result] = await to(promise);
    expect(err).toBe(error);
    expect(result).toBeUndefined();
  });
});
