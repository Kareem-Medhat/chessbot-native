const state = {
	lastMessage: null,
	fishes: [],
	indexMap: new Map()
};

const markAsLast = (state, message) => {
  const encoded = `${message.depth}\0${message.move}`;

  if (state.lastMessage === encoded) {
    return false;
  }

  state.lastMessage = encoded;
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
        info.depth = +parts[i + 1];
        i++;
        break;
      case "pv":
        info.pv = parts.slice(i + 1);
        break loop;
			case "multipv":
				info.multipv = +parts[i+1];
				i++;
				break;
    }
    i++;
  }

  return info;
}



const handleStdout = (data) => {
    const text = data.toString("utf-8");
    const lines = text.trimEnd().split("\n");
    for (const line of lines) {
      let info;
      if ((info = parseInfo(line))?.pv) {
				console.log(info);
      } else if (line.startsWith("bestmove")) {
        state.lastMessage = null;
      }
    }
  };

const stockfish = require("node:child_process").spawn("stockfish");
stockfish.stdin.write("setoption name Threads value 6\n");
stockfish.stdin.write("setoption name Hash value 64\n");

stockfish.stdout.on('data', handleStdout);

process.stdin.on('readable', () => {
	let chunks = [];
	let chunk = null;

	while ((chunk = process.stdin.read()) !== null) {
		chunks.push(chunk);
	}

	stockfish.stdin.write(Buffer.concat(chunks));

});
