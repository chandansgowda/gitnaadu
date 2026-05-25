module.exports = (api) => {
  const isDev = api.env("development");
  api.cache.using(() => process.env.NODE_ENV);

  return {
    presets: [
      ["@babel/preset-env", { targets: "defaults" }],
      ["@babel/preset-react", { runtime: "automatic" }],
    ],
    plugins: [isDev && require.resolve("react-refresh/babel")].filter(Boolean),
  };
};
