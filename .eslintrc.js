module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2022: true,
  },
  extends: ["eslint:recommended", "prettier"],
  rules: {
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
};
