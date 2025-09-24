import express from "express";

import { startServer } from "../../src/utils/server";

jest.mock("express", () => {
  const mockApp = {
    get: jest.fn(),
    listen: jest.fn(),
  };
  return jest.fn(() => mockApp);
});

describe("startServer", () => {
  let mockApp: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApp = express();
  });

  it("should start the server on the default port 3000 if no port is provided", () => {
    startServer();
    expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it("should start the server on the provided port", () => {
    startServer(8080);
    expect(mockApp.listen).toHaveBeenCalledWith(8080, expect.any(Function));
  });

  it("should default to port 3000 for an invalid port", () => {
    startServer(0);
    expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    startServer(-1);
    expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    startServer(65536);
    expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it("should register a /health endpoint", () => {
    startServer();
    expect(mockApp.get).toHaveBeenCalledWith("/health", expect.any(Function));
  });

  it("should respond with 200 OK on the /health endpoint", () => {
    startServer();
    const healthCheckHandler = (mockApp.get as jest.Mock).mock.calls[0][1];
    const mockReq = {};
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    healthCheckHandler(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith("OK");
  });
});
