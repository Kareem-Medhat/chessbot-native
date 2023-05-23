#!/usr/bin/node
const { spawn } = require("node:child_process");

const stockfish = spawn("stockfish");

const sessions = new Map();

function createStdoutHandler(state) {
  return (data) => {
    const text = data.toString("utf-8");
    const lines = text.trimEnd().split("\n");
    for (const line of lines) {
      if ((info = parseInfo(line))?.pv) {
        const move = info.pv[0];
        const depth = info.depth;

        if (markAsLast({ move, depth })) {
          sendMessage(
            encodeMessage({
              requestID,
              move,
              depth,
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
  if (parts[0] !== "info") return;

  let info = {};
  let i = 1;

  loop: while (i < parts.length) {
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

stockfish.stdout.on("data", (data) => {
  const text = data.toString("utf-8");
  const lines = text.trimEnd().split("\n");
  for (const line of lines) {
    if ((info = parseInfo(line))?.pv) {
      const move = info.pv[0];
      const depth = info.depth;

      if (markAsLast({ move, depth })) {
        sendMessage(
          encodeMessage({
            requestID,
            move,
            depth,
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

  const processData = async () => {
    const stringData = Buffer.concat(chunks);
    if (stringData.length === 0) return;

    if (!sizeHasBeenRead()) {
      payloadSize = stringData.readUInt32LE(0);
    }

    if (stringData.length >= payloadSize + 4) {
      // Remove the header
      const contentWithoutSize = stringData.subarray(4, payloadSize + 4);

      const message = JSON.parse(contentWithoutSize);
      await handleMessage(message);

      if (stringData.length > payloadSize + 4) {
        chunks = [stringData.subarray(payloadSize + 4)];
        payloadSize = null;
        await processData();
      } else {
        flushChunksQueue();
      }
    }
  };

  process.stdin.on("readable", () => {
    let chunk = null;

    // Read all of the available data
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
    content,
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

async function handleMessage(message) {
  switch (message.type) {
    case "FIND_MOVE":
      requestID = message.id;
      let uci = await getUCIFromPGN(message.pgn);
      stockfish.stdin.write(`position startpos moves ${uci}\ngo infinite\n`);
      break;
    case "STOP":
      stockfish.stdin.write("stop\n");
      break;
  }
}

listen();
