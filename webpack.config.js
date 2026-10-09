const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const fs = require("fs");

// Emits public/sw.js as /sw.js with this build's version and the list of
// emitted files to precache, so the installed app works offline.
class SwPrecachePlugin {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap("SwPrecachePlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: "SwPrecachePlugin", stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        () => {
          const skip = /(\.map|\.LICENSE\.txt|^index\.html|^og-image\.png|^sw\.js)$/;
          const urls = [
            "/",
            ...Object.keys(compilation.assets)
              .filter((name) => !skip.test(name))
              .map((name) => "/" + name),
          ];
          const src = fs
            .readFileSync(path.resolve(__dirname, "public/sw.js"), "utf8")
            .replaceAll("__BUILD_VERSION__", compilation.hash)
            .replaceAll("__PRECACHE_URLS__", JSON.stringify(urls));
          compilation.emitAsset("sw.js", new sources.RawSource(src));
        },
      );
    });
  }
}

module.exports = (env, argv) => {
  const isDev = argv.mode !== "production";

  return {
    entry: "./src/index.js",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: isDev ? "[name].js" : "[name].[contenthash].js",
      publicPath: "/",
      clean: true,
    },
    resolve: {
      extensions: [".js", ".jsx"],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              // Fast Refresh is dev-only. Gating it on webpack's `isDev`
              // (driven by --mode) keeps $RefreshReg$ out of prod builds.
              plugins: isDev ? [require.resolve("react-refresh/babel")] : [],
            },
          },
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp)$/i,
          type: "asset",
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./public/index.html",
        favicon: "./public/favicon.svg",
      }),
      // Copy static social/SEO + installable-app assets (served verbatim at
      // the site root).
      new CopyWebpackPlugin({
        patterns: [
          "og-image.png",
          "manifest.webmanifest",
          "icon-192.png",
          "icon-512.png",
          "apple-touch-icon.png",
        ].map((f) => ({ from: `public/${f}`, to: f })),
      }),
      new SwPrecachePlugin(),
      isDev && new ReactRefreshWebpackPlugin(),
    ].filter(Boolean),
    devServer: {
      static: false,
      hot: true,
      open: true,
      port: 3000,
      historyApiFallback: true,
    },
    devtool: isDev ? "eval-source-map" : "source-map",
  };
};
