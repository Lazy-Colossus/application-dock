// The tea sprig, in a 48×48 box: the tea home's Cabinet tile and the dock's
// Tea card both draw it from here. Each leaf carries its own midrib as a
// second subpath, so filling it even-odd cuts the rib clean through — the
// sprig then reads on any background without a cut-out colour.

export const LEAF_VIEWBOX = "0 0 48 48";

export const LEAF_PATHS: readonly string[] = [
  // stem
  "M22.8 45 C22.9 40 23 34 22.8 29.5 L25.6 28.6 C24.6 33 24.2 39 24.6 45 Z",
  // top leaf
  "M21.4 1.9 C16.5 7 14.8 13.5 16.8 18.5 C18.5 22.5 21.5 25 22.8 29.5 L25.8 28.4 C29.5 24.5 31.8 20 30.6 15.5 C29.3 10 26 5.5 21.4 1.9 Z " +
    "M23.8 9.5 C27.6 14 28.6 21 26.3 28 C27.2 21 26.4 14.6 23.8 9.5 Z",
  // leaf up to the left
  "M7 13.2 C11 15.5 17.5 18 20.8 23 C22.2 25.5 22.8 29 22.6 32.6 C19 31.8 13 31 10 28 C6.5 24.5 6 18 7 13.2 Z " +
    "M12 21.6 C16.8 23 20.4 26.6 22.2 31.8 C19.6 27.9 16.2 24.9 12 21.6 Z",
  // leaf out to the right
  "M24.4 36.5 C25.5 31 28.5 26.5 33 25 C37 23.7 41.5 25.5 44.6 28.9 C41.5 30.2 39.5 33.5 35.5 34.8 C31.5 36 27.5 35.5 24.4 36.5 Z " +
    "M40.3 27.6 C35 25.8 29 27.2 25.2 33.2 C29.4 28.8 34.8 27.8 40.3 27.6 Z",
];
