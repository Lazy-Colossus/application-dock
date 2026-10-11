import { describe, it, expect } from "vitest";
import { socketAt, toggleSocket } from "./sockets";

describe("toggleSocket", () => {
  it("adds a socket on an empty square and removes one already there", () => {
    const one = toggleSocket([], { col: 3, row: 4 });
    expect(one).toEqual([{ col: 3, row: 4 }]);
    const two = toggleSocket(one, { col: 5, row: 4 });
    expect(toggleSocket(two, { col: 3, row: 4 })).toEqual([{ col: 5, row: 4 }]);
  });
});

describe("socketAt", () => {
  // At 100 % a 12 px symbol reaches 7.5 cm from the socket's centre, (17.5, 22.5) cm here.
  const sockets = [{ col: 3, row: 4 }];

  it("finds a socket whose symbol covers the point, even on the next square", () => {
    expect(socketAt(sockets, { x: 24, y: 22.5 }, 1.25)).toEqual(sockets[0]);
  });

  it("misses past the symbol, which shrinks in cm as you zoom in", () => {
    expect(socketAt(sockets, { x: 26, y: 22.5 }, 1.25)).toBeNull();
    expect(socketAt(sockets, { x: 24, y: 22.5 }, 0.3125)).toBeNull();
  });
});
