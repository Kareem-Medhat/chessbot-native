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

// program.ts
var import_child_process = require("child_process");
var sessions = /* @__PURE__ */ new Map();
function createStdoutHandler(state) {
  return (data) => {
    var _a;
    const text = data.toString("utf-8");
    const lines = text.trimEnd().split("\n");
    for (const line of lines) {
      let info;
      if ((_a = info = parseInfo(line)) == null ? void 0 : _a.pv) {
        const move = info.pv[0];
        const depth = +info.depth;
        if (markAsLast(state, { move, depth })) {
          sendMessage(
            encodeMessage({
              requestID: state.requestID,
              sessionID: state.id,
              move,
              depth
            })
          );
        }
      } else if (line.startsWith("bestmove")) {
        state.lastMessage = null;
      }
    }
  };
}
var markAsLast = (state, message) => {
  const encoded = `${message.depth}\0${message.move}`;
  if (state.lastMessage === encoded) {
    return false;
  }
  state.lastMessage = encoded;
  return true;
};
function parseInfo(line) {
  const parts = line.split(" ");
  if (parts[0] !== "info")
    return;
  let info = {};
  let i = 1;
  loop:
    while (i < parts.length) {
      const name = parts[i];
      switch (name) {
        case "depth":
          info.depth = parts[i + 1];
          i++;
          break;
        case "pv":
          info.pv = parts.slice(i + 1);
          break loop;
      }
      i++;
    }
  return info;
}
function listen() {
  let payloadSize = null;
  let queue = [];
  let handling = Promise.resolve();
  let chunks = [];
  const flushChunksQueue = () => {
    payloadSize = null;
    chunks.splice(0);
  };
  const processData = () => __async(this, null, function* () {
    const stringData = Buffer.concat(chunks);
    if (stringData.length === 0)
      return;
    if (!payloadSize) {
      payloadSize = stringData.readUInt32LE(0);
    }
    if (stringData.length >= payloadSize + 4) {
      const contentWithoutSize = stringData.subarray(4, payloadSize + 4);
      const message = JSON.parse(contentWithoutSize.toString());
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
  return Buffer.concat([length, content]);
}
function sendMessage(encoded) {
  process.stdout.write(encoded);
}
function getUCIFromPGN(pgn) {
  return new Promise((resolve) => {
    let chunks = [];
    let { stdout, stdin } = (0, import_child_process.spawn)("pgn-extract", ["-Wuci", "--notags"]);
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
    let session = sessions.get(message.sessionID);
    if (!session) {
      const state = {
        id: message.sessionID,
        lastMessage: null,
        requestID: null,
        stockfish: (0, import_child_process.spawn)("stockfish")
      };
      state.stockfish.stdin.write("uci\n");
      state.stockfish.stdout.on("data", createStdoutHandler(state));
      sessions.set(message.sessionID, state);
      session = state;
    }
    switch (message.type) {
      case "FIND_MOVE":
        session.requestID = message.id;
        let uci = yield getUCIFromPGN(message.pgn);
        session.stockfish.stdin.write(
          `position startpos moves ${uci}
go infinite
`
        );
        break;
      case "STOP":
        session.stockfish.stdin.write("stop\n");
        break;
      case "SESSION_ENDED":
        session.stockfish.kill();
        sessions.delete(session.id);
        break;
    }
  });
}
listen();
