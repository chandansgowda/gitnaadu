module.exports = {
  presets: [
    ["@babel/preset-env", { targets: "defaults" }],
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
  // The react-refresh/babel plugin is injected by webpack (babel-loader
  // options) only in development — see webpack.config.js.
};
