import { getCoords } from "./get-coords";
import { MoveIndicator } from "./move-indicator";

const port = chrome.runtime.connect();
// INIT
port.postMessage({ type: "URL_IS_A_MATCH" });

const periodMap: { [x: string]: number } = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8,
};

const indicator = new MoveIndicator();

class Moves {
  moves: Array<[string, string | undefined]>;
  nextTurn?: "black" | "white";
  result?: string;

  constructor() {
    this.moves = [];
  }

  readList(list: Element) {
    for (let move of list.children) {
      const isMove = (move as HTMLElement).dataset.wholeMoveNumber;

      if (!isMove) {
        // black won
        this.result = (move as HTMLElement).innerText;
        break;
      }

      let [white, black] = move.children;
      if (!black) {
        this.nextTurn = "black";
      } else if (black.classList.contains("game-result")) {
        this.result = (black as HTMLElement).innerText;
        break;
      }

      this.moves.push([
        (white as HTMLElement).innerText,
        (black as HTMLElement)?.innerText,
      ]);
    }

    if (!this.result && !this.nextTurn) {
      this.nextTurn = "white";
    }

    return this;
  }

  getPgn() {
    return (
      this.moves.reduce((acc, [white, black], idx) => {
        return `${acc}${idx + 1}. ${white}${black ? ` ${black}` : ""} `;
      }, "") + (this.result || "*")
    );
  }
}

let observer: MutationObserver | null = null;
let gameEnded = false;
port.onMessage.addListener((message) => {
  if (message.type === "LISTEN_MOVES") {
    let isWhite = !document
      .querySelector("chess-board")!
      .classList.contains("flipped");
    let moveList = document.querySelector("vertical-move-list")!;

    let moves = new Moves().readList(moveList);
    if (!observer) {
      observer = new MutationObserver(() => {
        moves = new Moves().readList(moveList);
        if (moves.result) {
          alert("GAME ENDED");
          return port.postMessage({
            type: "SWITCH_OFF",
          });
        }
        port.postMessage({
          type: "FIND_MOVE",
          pgn: moves.getPgn(),
        });
      });
    }
    if (moveList) {
      observer.observe(moveList, {
        childList: true,
        subtree: true,
      });
    }

    if ((moves.nextTurn === "white") === isWhite) {
      port.postMessage({
        type: "FIND_MOVE",
        pgn: moves.getPgn(),
      });
    }
  } else if (message.type === "UNLISTEN_MOVES") {
    if (observer) {
      observer.disconnect();
    }
  } else if (message.type === "PLAY_MOVE") {
    if (observer) {
      observer.disconnect();
    }
    const [[srcPeriod, srcRank], [destPeriod, destRank]] = [
      message.move.slice(0, 2),
      message.move.slice(2, 4),
    ];
    let chessboard = document.querySelector("chess-board")!;
    let isFlipped = chessboard.classList.contains("flipped");
    const className = `.square-${periodMap[srcPeriod]}${srcRank}`;
    let piece = chessboard.querySelector(`.piece${className}`)! as HTMLElement;

    piece.style.backgroundColor = "red";
    let pieceCoords = getCoords(piece);

    const stepsY = isFlipped ? srcRank - destRank : destRank - srcRank;
    const stepsX = isFlipped
      ? periodMap[srcPeriod] - periodMap[destPeriod]
      : periodMap[destPeriod] - periodMap[srcPeriod];

    const destY =
      pieceCoords.top - stepsY * piece.clientHeight + 0.3 * piece.clientHeight;
    const destX =
      pieceCoords.left + stepsX * piece.clientWidth + 0.3 * piece.clientWidth;

    moveIndicator.style.transform = "";

    let moveIndicatorCoords = getCoords(moveIndicator);

    moveIndicator.style.transform = `translateX(${
      destX - moveIndicatorCoords.left
    }px) translateY(${destY - moveIndicatorCoords.top}px)`;
    moveIndicator.style.fontSize = `${0.4 * piece.clientWidth}px`;

    if (observer) {
      let moveList = document.querySelector("vertical-move-list")!;
      let waitForMove = new Promise((resolve) => {
        let n = new MutationObserver(() => {
          piece.style.backgroundColor = "";
          moveIndicator.style.transform = "";
          moveIndicator.style.fontSize = "";
          n.disconnect();
          resolve(1);
        });
        if (moveList) {
          n.observe(moveList, {
            childList: true,
            subtree: true,
          });
        }
      });
      waitForMove.then(() => {
        observer &&
          observer.observe(moveList, {
            childList: true,
            subtree: true,
          });
      });
    }
  }
});

export {};
