const js = require("@eslint/js");
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    "languageOptions": {
      "ecmaVersion": 2017,
      "sourceType": "module",
      "globals": {
        ...globals.browser,
        ...globals.node,
      }
    }
  }
]
