import type { Lifecycle } from "./types";

/**
 * Best guess at which funnel step a CRM stage name represents, used to
 * pre-fill stage mappings. Order matters: "No Show" must not match "show",
 * "Not Qualified" must not match "qualified", and so on.
 */
const RULES: [RegExp, Lifecycle][] = [
  [/\b(not|un|dis)[\s-]?qualif|\bunqualif|\bdisqualif|\bjunk|\bspam|\bwrong\s*number|\bnot\s*interested|\binvalid/i, "unqualified"],
  [/\b(lost|closed[\s-]*lost|dead|cancel+ed|no[\s-]*show|did\s*not\s*(attend|show)|declined|rejected)\b/i, "lost"],
  [/\b(won|closed[\s-]*won|sold|signed|deposit|paid|customer|job\s*booked|contract)\b/i, "won"],
  [/\b(show(ed)?|attended|completed\s*(call|appointment|consult)|quote\s*sent|proposal|survey\s*(done|completed))\b/i, "showed"],
  [/\b(booked|appointment|scheduled|call\s*booked|consult(ation)?|meeting|survey\s*booked|site\s*visit)\b/i, "booked"],
  [/\b(qualified|hot|warm|interested|mql|sql)\b/i, "qualified"],
  [/\b(contacted|attempt(ed)?|follow[\s-]*up|in\s*progress|nurtur|responded|replied|called|voicemail|no\s*answer)\b/i, "contacted"],
  [/\b(new|fresh|incoming|inbound|uncontacted|enquiry|inquiry|opt[\s-]*in)\b/i, "new"],
];

export function suggestLifecycle(stageName: string): Lifecycle | null {
  for (const [re, lifecycle] of RULES) if (re.test(stageName)) return lifecycle;
  return null;
}
