// Only Jest reads this; the app itself is compiled by tsc. Tests compile to CommonJS so jest.mock() works without
// Node's experimental VM modules.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }], "@babel/preset-typescript"],
};
