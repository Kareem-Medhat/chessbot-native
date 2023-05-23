export type Coords = [number, number];

export function getCoords(element: Element): [number, number] {
  // crossbrowser version
  var box = element.getBoundingClientRect();
  return [box.x, box.y];
}
