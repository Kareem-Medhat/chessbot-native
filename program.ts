#!/usr/bin/node
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

type State = {
  id: any;
  requestID: any;
  lastMessage: string | null;
  stockfish: ChildProcessWithoutNullStreams;
};

const sessions: Map<number, State> = new Map();

function createStdoutHandler(state: State) {
  return (data: Buffer) => {
    const text = data.toString("utf-8");
    const lines = text.trimEnd().split("\n");
    for (const line of lines) {
      let info;
      if ((info = parseInfo(line))?.pv) {
        const move = info.pv[0];
        const depth = +info.depth;

        if (markAsLast(state, { move, depth })) {
          sendMessage(
            encodeMessage({
              requestID: state.requestID,
              sessionID: state.id,
              move,
              depth,
            })
          );
        }
      } else if (line.startsWith("bestmove")) {
        state.lastMessage = null;
      }
    }
  };
}

const markAsLast = (state: State, message: { depth: number; move: string }) => {
  const encoded = `${message.depth}\0${message.move}`;

  if (state.lastMessage === encoded) {
    return false;
  }

  state.lastMessage = encoded;
  return true;
};

function parseInfo(line: string) {
  const parts = line.split(" ");
  if (parts[0] !== "info") return;

  let info: Record<string, any> = {};
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

function listen() {
  let payloadSize: number | null = null;
  let queue: Buffer[] = [];
  let handling = Promise.resolve();
  let chunks: Buffer[] = [];

  const flushChunksQueue = () => {
    payloadSize = null;
    chunks.splice(0);
  };

  const processData = async () => {
    const stringData = Buffer.concat(chunks);
    if (stringData.length === 0) return;

    if (!payloadSize) {
      payloadSize = stringData.readUInt32LE(0);
    }

    if (stringData.length >= payloadSize + 4) {
      // Remove the header
      const contentWithoutSize = stringData.subarray(4, payloadSize + 4);

      const message = JSON.parse(contentWithoutSize.toString());
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

function encodeMessage(message: any) {
  const content = Buffer.from(JSON.stringify(message), "utf-8");
  const length = Buffer.allocUnsafe(4);
  length.writeInt32LE(content.length, 0);
  return Buffer.concat([length, content]);
}

function sendMessage(encoded: Buffer) {
  process.stdout.write(encoded);
}

function getUCIFromPGN(pgn: string) {
  return new Promise((resolve) => {
    let chunks: Buffer[] = [];
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

async function handleMessage(message: any) {
  let session = sessions.get(message.sessionID);
  if (!session) {
    const state: State = {
      id: message.sessionID,
      lastMessage: null,
      requestID: null,
      stockfish: spawn("stockfish"),
    };
    state.stockfish.stdin.write("uci\n");
    state.stockfish.stdout.on("data", createStdoutHandler(state));
    sessions.set(message.sessionID, state);
    session = state;
  }

  switch (message.type) {
    case "FIND_MOVE":
      session.requestID = message.id;
      let uci = await getUCIFromPGN(message.pgn);
      session.stockfish.stdin.write(
        `position startpos moves ${uci}\ngo infinite\n`
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
}

listen();
