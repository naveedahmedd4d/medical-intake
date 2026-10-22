module.exports = {
  root: true,
  env: {
    node: true,
    es2020: true,
  },
  parser: "babel-eslint",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  extends: ["airbnb-base", "prettier"],
  rules: {
    "no-console": "off",
    "import/prefer-default-export": "off",
    "import/no-extraneous-dependencies": "off",
    "class-methods-use-this": "off",
    "no-underscore-dangle": "off",
    "consistent-return": "off",
    "no-param-reassign": "off",
  },
};
