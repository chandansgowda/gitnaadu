const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");

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
          // Retired service worker: unregisters the one earlier builds installed.
          "sw.js",
        ].map((f) => ({ from: `public/${f}`, to: f })),
      }),
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
