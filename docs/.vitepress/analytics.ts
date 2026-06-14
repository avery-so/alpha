type HeadEntry =
  | [tag: string, attrs: Record<string, string>]
  | [tag: string, attrs: Record<string, string>, children: string];

const getOptionalEnv = (name: string) => {
  const value = process.env[name]?.trim();

  return value || undefined;
};

const isCloudflarePagesProductionBuild = () =>
  ["1", "true"].includes(process.env.CF_PAGES ?? "") && process.env.CF_PAGES_BRANCH === "main";

const requireProductionAnalyticsEnv = (values: Record<string, string | undefined>) => {
  if (!isCloudflarePagesProductionBuild()) {
    return;
  }

  const missingNames = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingNames.length === 0) {
    return;
  }

  throw new Error(
    `Missing required analytics environment variable(s) for Cloudflare Pages production build: ${missingNames.join(", ")}`,
  );
};

const createGoogleAnalyticsHeadEntries = (googleAnalyticsId: string): HeadEntry[] => {
  const serializedGoogleAnalyticsId = JSON.stringify(googleAnalyticsId);

  return [
    [
      "script",
      {
        async: "",
        src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAnalyticsId)}`,
      },
    ],
    [
      "script",
      {},
      [
        "window.dataLayer = window.dataLayer || [];",
        "function gtag(){dataLayer.push(arguments);}",
        "gtag('js', new Date());",
        `gtag('config', ${serializedGoogleAnalyticsId});`,
      ].join("\n"),
    ],
  ];
};

const createMicrosoftClarityHeadEntries = (clarityProjectId: string): HeadEntry[] => {
  const clarityScriptUrl = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`;
  const serializedClarityScriptUrl = JSON.stringify(clarityScriptUrl);

  return [
    [
      "script",
      {},
      [
        "(function(c,l,a,r,t,y){",
        "c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};",
        `t=l.createElement(r);t.async=1;t.src=${serializedClarityScriptUrl};`,
        "y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);",
        '})(window, document, "clarity", "script");',
      ].join("\n"),
    ],
  ];
};

const createAnalyticsHeadEntries = (): HeadEntry[] => {
  const googleAnalyticsId = getOptionalEnv("DOCS_GOOGLE_ANALYTICS_ID");
  const clarityProjectId = getOptionalEnv("DOCS_MICROSOFT_CLARITY_PROJECT_ID");
  const entries: HeadEntry[] = [];

  requireProductionAnalyticsEnv({
    DOCS_GOOGLE_ANALYTICS_ID: googleAnalyticsId,
    DOCS_MICROSOFT_CLARITY_PROJECT_ID: clarityProjectId,
  });

  if (googleAnalyticsId) {
    entries.push(...createGoogleAnalyticsHeadEntries(googleAnalyticsId));
  }

  if (clarityProjectId) {
    entries.push(...createMicrosoftClarityHeadEntries(clarityProjectId));
  }

  return entries;
};

export default createAnalyticsHeadEntries;
