#!/usr/bin/node
"use strict";
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
const { spawn } = require("node:child_process");
const stockfish = spawn("stockfish");
const sessions = /* @__PURE__ */ new Map();
function createStdoutHandler(state) {
  return (data) => {
    var _a;
    const text = data.toString("utf-8");
    const lines = text.trimEnd().split("\n");
    for (const line of lines) {
      if ((_a = info = parseInfo(line)) == null ? void 0 : _a.pv) {
        const move = info.pv[0];
        const depth = info.depth;
        if (markAsLast({ move, depth })) {
          sendMessage(
            encodeMessage({
              requestID,
              move,
              depth
            })
          );
        }
      } else if (line.startsWith("bestmove")) {
        lastMove = null;
      }
    }
  };
}
const markAsLast = (message) => {
  const encoded = `${message.depth}\0${message.move}`;
  if (lastMessage === encoded) {
    return false;
  }
  lastMessage = encoded;
  return true;
};
function parseInfo(line) {
  const parts = line.split(" ");
  if (parts[0] !== "info")
    return;
  let info2 = {};
  let i = 1;
  loop:
    while (i < parts.length) {
      const name = parts[i];
      switch (name) {
        case "depth":
          info2.depth = parts[i + 1];
          i++;
          break;
        case "pv":
          info2.pv = parts.slice(i + 1);
          break loop;
      }
      i++;
    }
  return info2;
}
stockfish.stdout.on("data", (data) => {
  var _a;
  const text = data.toString("utf-8");
  const lines = text.trimEnd().split("\n");
  for (const line of lines) {
    if ((_a = info = parseInfo(line)) == null ? void 0 : _a.pv) {
      const move = info.pv[0];
      const depth = info.depth;
      if (markAsLast({ move, depth })) {
        sendMessage(
          encodeMessage({
            requestID,
            move,
            depth
          })
        );
      }
    } else if (line.startsWith("bestmove")) {
      lastMove = null;
    }
  }
});
function listen() {
  let payloadSize = null;
  let queue = [];
  let handling = Promise.resolve();
  let chunks = [];
  const sizeHasBeenRead = () => Boolean(payloadSize);
  const flushChunksQueue = () => {
    payloadSize = null;
    chunks.splice(0);
  };
  const processData = () => __async(this, null, function* () {
    const stringData = Buffer.concat(chunks);
    if (stringData.length === 0)
      return;
    if (!sizeHasBeenRead()) {
      payloadSize = stringData.readUInt32LE(0);
    }
    if (stringData.length >= payloadSize + 4) {
      const contentWithoutSize = stringData.subarray(4, payloadSize + 4);
      const message = JSON.parse(contentWithoutSize);
      yield handleMessage(message);
      if (stringData.length > payloadSize + 4) {
        chunks = [stringData.subarray(payloadSize + 4)];
        payloadSize = null;
        yield processData();
      } else {
        flushChunksQueue();
      }
    }
  });
  process.stdin.on("readable", () => {
    let chunk = null;
    while ((chunk = process.stdin.read()) !== null) {
      queue.push(chunk);
    }
    handling.then(() => {
      chunks.push(...queue);
      queue.splice(0);
      handling = processData();
    });
  });
}
function encodeMessage(message) {
  const content = Buffer.from(JSON.stringify(message), "utf-8");
  const length = Buffer.allocUnsafe(4);
  length.writeInt32LE(content.length, 0);
  return {
    length,
    content
  };
}
function sendMessage(encoded) {
  process.stdout.write(Buffer.concat([encoded.length, encoded.content]));
}
function getUCIFromPGN(pgn) {
  return new Promise((resolve) => {
    let chunks = [];
    let { stdout, stdin } = spawn("pgn-extract", ["-Wuci", "--notags"]);
    stdout.on("data", (chunk) => {
      chunks.push(chunk);
    });
    stdout.once("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    stdin.write(pgn);
    stdin.end();
  });
}
function handleMessage(message) {
  return __async(this, null, function* () {
    switch (message.type) {
      case "FIND_MOVE":
        requestID = message.id;
        let uci = yield getUCIFromPGN(message.pgn);
        stockfish.stdin.write(`position startpos moves ${uci}
go infinite
`);
        break;
      case "STOP":
        stockfish.stdin.write("stop\n");
        break;
    }
  });
}
listen();
