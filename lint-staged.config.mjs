export default {
  // oxfmt 0.8.0 treats positional args as glob patterns and rejects explicit
  // file/dir paths ("Expected at least one target file"); only the implicit
  // cwd works. Run it in cwd mode here — lint-staged stashes unstaged changes
  // during the run, so this effectively formats only the staged snapshot.
  "*.{js,jsx,ts,tsx,json,jsonc,md,yml,yaml}": () => "oxfmt .",
  "*.{js,jsx,ts,tsx}": () => "oxlint --max-warnings=0",
};
