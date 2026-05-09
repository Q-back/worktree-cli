export const theme = {
  // Raw palette
  accent: "#FCD34D",
  text: "#E7E5E4",
  muted: "#A8A29E",
  dim: "#57534E",
  error: "#F87171",

  // Semantic — branch state
  active: "#67E8F9", // isActive: cyan = you are here
  worktree: "#FCD34D", // kind=worktree (not active): gold = open elsewhere
  branch: "#57534E", // kind=branch (not active): dim = dormant
  create: "#FCD34D", // kind=create: gold = action
  home: "#A78BFA", // kind=main: violet = repo origin / home

  // Semantic — chrome
  cursor: "#FCD34D", // arrow selection indicator
  prompt: "#FCD34D", // input prompt
  separator: "#57534E", // lines
} as const;
