import maxCommentLines from "./rules/max-comment-lines.js";

/** @type {import("eslint").ESLint.Plugin} */
export default {
  meta: { name: "eslint-plugin-maple", version: "0.0.0" },
  rules: { "max-comment-lines": maxCommentLines },
};
