import { Coords, getCoords } from "./get-coords";

const icons: { [name: string]: string } = {
  default: "🟢",
  q: "👑",
  n: "🐎",
  r: "🏰",
  b: "🎩",
};

export class MoveIndicator {
  private element: HTMLElement;
  private baseCoords: Coords;

  constructor() {
    this.element = document.createElement("div");
    this.element.innerText = icons.default;
    this.initAppearance();
    this.mount();
    this.baseCoords = getCoords(this.element);
  }

  private initAppearance() {
    Object.assign(this.element.style, {
      position: "absolute",
      zIndex: "9999",
      pointerEvents: "none",
      visibility: "hidden",
    });
  }

  private mount() {
    document.body.prepend(this.element);
  }

  setDefaultIcon() {
    this.element.innerText = icons.default;
  }

  setIcon(icon: string) {
    this.element.innerText = icons[icon];
  }

  hide() {
    this.element.style.visibility = "hidden";
  }

  centerAt(coords: Coords, opts: { fontSize: string }) {
    this.element.style.fontSize = opts.fontSize;
    const { width, height } = this.element.getBoundingClientRect();
    this.element.style.transform = `translateX(${
      coords[0] - this.baseCoords[0] - width / 2
    }px) translateY(${coords[1] - this.baseCoords[1] - height / 2}px)`;
  }

  show() {
    this.element.style.visibility = "";
  }
}
