import express from "express";

/**
 * Starts an Express server with a health check endpoint.
 *
 * @param port The port to listen on. Defaults to 3000.
 */
export function startServer(port: number = 3000) {
  const app = express();

  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
