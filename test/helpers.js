const http = require("node:http");
const { PassThrough } = require("node:stream");

// Exercise Express and its JSON parser without binding a network port.
function request(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough();
    const chunks = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    const req = new http.IncomingMessage(socket);
    Object.assign(req, {
      method,
      url,
      httpVersion: "1.1",
      httpVersionMajor: 1,
      httpVersionMinor: 1,
      complete: true,
      headers: { host: "localhost" },
    });
    const data = body === undefined ? "" : JSON.stringify(body);
    if (body !== undefined) {
      req.headers["content-type"] = "application/json";
      req.headers["content-length"] = Buffer.byteLength(data);
    }
    const res = new http.ServerResponse(req);
    res.assignSocket(socket);
    res.on("finish", () => {
      const raw = Buffer.concat(chunks).toString();
      try {
        resolve({
          status: res.statusCode,
          body: JSON.parse(raw.slice(raw.indexOf("\r\n\r\n") + 4)),
        });
      } catch (error) {
        reject(error);
      } finally {
        socket.destroy();
      }
    });
    app(req, res);
    if (data) req.push(data);
    req.push(null);
  });
}

module.exports = request;
